import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, openSync, writeFileSync} from 'node:fs';
const executable = process.argv[2] || 'src-tauri/target/release/bundle/macos/Task Sprite.app/Contents/MacOS/task-sprite';
mkdirSync('ci-logs', {recursive: true});
const child = spawn(executable, [], {stdio: ['ignore', openSync('ci-logs/startup.stdout.log', 'w'), openSync('ci-logs/startup.stderr.log', 'w')]});
let exited = false;
child.on('exit', () => { exited = true; });
child.on('error', error => { console.error(error); exited = true; });
try {
  await new Promise(resolve => setTimeout(resolve, 15000));
  if (exited) throw new Error('Application exited during startup.');
  // CoreGraphics observes real native windows without scripting/accessibility permission.
  const source = `import CoreGraphics\nlet windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []\nlet count = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == ${child.pid} }.count\nprint(count)\nif count == 0 { exit(1) }\n`;
  writeFileSync('ci-logs/windows.swift', 'import Darwin\n' + source);
  const result = spawnSync('swift', ['ci-logs/windows.swift'], {encoding: 'utf8'});
  writeFileSync('ci-logs/native-windows.log', result.stdout + result.stderr);
  if (result.status !== 0 || exited) throw new Error('No visible native application window found.');
  writeFileSync('ci-logs/startup.json', JSON.stringify({platform: 'macos', processId: child.pid, visibleWindows: Number(result.stdout.trim()), startup: 'passed', at: new Date().toISOString()}, null, 2));
} finally { child.kill('SIGTERM'); }
