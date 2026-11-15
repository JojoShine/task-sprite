param([string]$Executable = "src-tauri/target/release/task-sprite.exe", [string]$Installer = "", [switch]$DebugWebview)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force ci-logs | Out-Null
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SmokeWindows {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    public static IntPtr VisibleWindowFor(uint processId) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((window, unused) => { uint owner; GetWindowThreadProcessId(window, out owner); if (owner == processId && IsWindowVisible(window)) { result = window; return false; } return true; }, IntPtr.Zero);
        return result;
    }
    public static int VisibleFor(uint processId) {
        int count = 0;
        EnumWindows((window, unused) => { uint owner; GetWindowThreadProcessId(window, out owner); if (owner == processId && IsWindowVisible(window)) count++; return true; }, IntPtr.Zero);
        return count;
    }
}
'@
if ($Installer) {
    $destination = Join-Path $env:RUNNER_TEMP "task-sprite-installed"
    # NSIS requires /D as the final argument; this destination has no quoting ambiguity.
    $install = Start-Process -FilePath (Resolve-Path $Installer) -ArgumentList @("/S", "/D=$destination") -PassThru -Wait
    if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
    $binaries = @(Get-ChildItem $destination -Filter *.exe | Where-Object { $_.Name -notmatch "uninstall" })
    if ($binaries.Count -ne 1) { throw "Expected exactly one installed application executable" }
    $Executable = $binaries[0].FullName
    @{ installer = (Split-Path $Installer -Leaf); installedExecutable = $binaries[0].Name; result = "passed" } | ConvertTo-Json | Set-Content ci-logs/installation.json
}
$process = $null
$previousWebviewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
if ($DebugWebview) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222" }
try {
    $process = Start-Process -FilePath (Resolve-Path $Executable) -PassThru -RedirectStandardOutput ci-logs/startup.stdout.log -RedirectStandardError ci-logs/startup.stderr.log
    $visible = 0
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        $process.Refresh()
        if ($process.HasExited) { throw "Application exited during startup: $($process.ExitCode)" }
        $visible = [SmokeWindows]::VisibleFor($process.Id)
        if ($visible -gt 0) { break }
    }
    if ($visible -eq 0) { throw "No visible native window appeared for the application process" }
    Start-Sleep -Seconds 5
    $process.Refresh()
    if ($process.HasExited) { throw "Application crashed after showing its window" }
    if ($DebugWebview) {
        node scripts/verify-debug-webview.mjs
        if ($LASTEXITCODE -ne 0) { throw "Live native WebView did not render the Vite app" }
        Add-Type -AssemblyName System.Drawing
        $window = [SmokeWindows]::VisibleWindowFor($process.Id)
        $bounds = New-Object SmokeWindows+Rect
        if (-not [SmokeWindows]::GetWindowRect($window, [ref]$bounds)) { throw "Cannot read native window bounds" }
        $width = $bounds.Right - $bounds.Left
        $height = $bounds.Bottom - $bounds.Top
        if ($width -le 0 -or $height -le 0) { throw "Native window bounds are empty" }
        $bitmap = New-Object System.Drawing.Bitmap($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
            $bitmap.Save((Join-Path $PWD "ci-logs/windows-debug-native.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
    @{ mode = $(if ($DebugWebview) { "debug-test" } elseif ($Installer) { "installed-release" } else { "executable-startup" }); platform = "windows"; processId = $process.Id; visibleWindows = $visible; startup = "passed"; at = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content ci-logs/startup.json
} finally {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebviewArguments
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
