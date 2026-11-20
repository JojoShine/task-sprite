import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "./api";

type UpdateInfo = Awaited<ReturnType<typeof api.checkUpdate>>;

export function useAppUpdate() {
  const inFlight = useRef<Promise<UpdateInfo> | null>(null);
  const installing = useRef(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  const fetchUpdate = useCallback(() => {
    if (!inFlight.current) {
      inFlight.current = api.checkUpdate().finally(() => { inFlight.current = null; });
    }
    return inFlight.current;
  }, []);

  useEffect(() => {
    let active = true;
    async function backgroundCheck() {
      if (installing.current) return;
      try {
        const next = await fetchUpdate();
        if (active && !installing.current) setUpdate(next);
      } catch { /* Keep background checks silent. */ }
    }
    void backgroundCheck();
    const timer = window.setInterval(() => void backgroundCheck(), 60 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [fetchUpdate]);

  async function check() {
    if (busy || installing.current) return;
    setBusy("check");
    setChecked(false);
    setError("");
    try {
      setUpdate(await fetchUpdate());
      setChecked(true);
    } catch {
      setError("暂时无法获取更新，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    if (!update?.version || busy || installing.current) return;
    installing.current = true;
    setBusy("install");
    setError("");
    try {
      await api.installUpdate(update.version);
    } catch {
      installing.current = false;
      setError("更新未完成，请重新检查后重试。现有任务已保留。");
      setBusy(null);
    }
  }

  return { update, busy, checked, error, check, install };
}

export type AppUpdater = ReturnType<typeof useAppUpdate>;

export function UpdateControls({ updater }: { updater: AppUpdater }) {
  const { update, busy, checked, error, check, install } = updater;
  return <>
    {update?.version
      ? <p role="status">发现新版本 v{update.version}</p>
      : checked && <p role="status">当前已是最新版本</p>}
    {update?.version && update.notes && <p className="micro">{update.notes}</p>}
    <div className="update-controls">
      <button type="button" className="secondary icon-text" disabled={busy !== null} onClick={() => void check()}>
        <MagnifyingGlass size={17}/>{busy === "check" ? "正在检查…" : "检查更新"}
      </button>
      {update?.version && <button type="button" className="primary icon-text" disabled={busy !== null} onClick={() => void install()}>
        <DownloadSimple size={17}/>{busy === "install" ? "正在下载并安装…" : "下载安装并重启"}
      </button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

export function UpdateSettings({ updater }: { updater: AppUpdater }) {
  const entry = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const version = updater.update?.version;
  useEffect(() => {
    if (!version) setOpen(false);
  }, [version]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!entry.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); entry.current?.querySelector<HTMLButtonElement>(".update-trigger")?.focus(); } };
    const blur = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  if (!version) return null;
  return <div className="app-update" ref={entry}>
    <button type="button" className="update-trigger" aria-label="应用更新" title={`发现新版本 v${version}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
      <DownloadSimple size={21} weight="regular"/>
    </button>
    {open && <section className="identity-card update-popover" role="dialog" aria-label="应用更新">
      <div className="identity-heading"><DownloadSimple size={20} weight="regular"/><strong>应用更新</strong></div>
      <p>安装更新将保留本机任务和设置。</p>
      <UpdateControls updater={updater}/>
    </section>}
  </div>;
}
