import { useEffect, useRef, useState } from "react";
import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "./api";

export function UpdateSettings() {
  const entry = useRef<HTMLDivElement>(null);
  const installing = useRef(false);
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof api.checkUpdate>> | null>(null);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let checking = false;
    async function backgroundCheck() {
      if (checking || installing.current) return;
      checking = true;
      try {
        const next = await api.checkUpdate();
        if (active && !installing.current) {
          setUpdate(next);
          if (!next.version) setOpen(false);
        }
      } catch { /* Keep background checks silent. */ }
      finally { checking = false; }
    }
    void backgroundCheck();
    const timer = window.setInterval(() => void backgroundCheck(), 60 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!entry.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); entry.current?.querySelector<HTMLButtonElement>(".update-trigger")?.focus(); } };
    const blur = () => setOpen(false);
    document.addEventListener("pointerdown",outside);
    document.addEventListener("keydown",escape);
    window.addEventListener("blur",blur);
    return () => { document.removeEventListener("pointerdown",outside); document.removeEventListener("keydown",escape); window.removeEventListener("blur",blur); };
  },[open]);
  function toggle() {
    setOpen(!open);
  }
  async function check() {
    setBusy("check"); setError("");
    try { const next = await api.checkUpdate(); setUpdate(next); if (!next.version) setOpen(false); }
    catch { setError("暂时无法获取更新，请稍后重试。"); }
    finally { setBusy(null); }
  }
  async function install() {
    if (!update?.version || installing.current) return;
    installing.current = true;
    setBusy("install"); setError("");
    try { await api.installUpdate(update.version); }
    catch { installing.current = false; setError("更新未完成，请重新检查后重试。现有任务已保留。"); setBusy(null); }
  }
  if (!update?.version) return null;
  return <div className="app-update" ref={entry}>
    <button type="button" className="update-trigger" aria-label="应用更新" title={`发现新版本 v${update.version}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}><DownloadSimple size={21} weight="regular"/></button>
    {open && <section className="identity-card update-popover" role="dialog" aria-label="应用更新">
    <div className="identity-heading"><DownloadSimple size={20} weight="regular"/><strong>应用更新</strong></div>
    <p>安装更新将保留本机任务和设置。</p>
    <p role="status">发现新版本 v{update.version}</p>
    {update?.version && update.notes && <p className="micro">{update.notes}</p>}
    <button type="button" className="secondary icon-text" disabled={busy !== null} onClick={()=>void check()}><MagnifyingGlass size={17}/>{busy === "check" ? "正在检查…" : "检查更新"}</button>
    {update?.version && <button type="button" className="primary icon-text" disabled={busy !== null} onClick={()=>void install()}><DownloadSimple size={17}/>{busy === "install" ? "正在下载并安装…" : "下载安装并重启"}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>}
  </div>;
}
