import { useState } from "react";
import { ArrowClockwise, DownloadSimple } from "@phosphor-icons/react";
import { api } from "./api";

export function UpdateSettings() {
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof api.checkUpdate>> | null>(null);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState("");
  async function check() {
    setBusy("check"); setError(""); setUpdate(null);
    try { setUpdate(await api.checkUpdate()); }
    catch { setError("暂时无法检查更新，请确认网络后重试。"); }
    finally { setBusy(null); }
  }
  async function install() {
    if (!update?.version) return;
    setBusy("install"); setError("");
    try { await api.installUpdate(update.version); }
    catch { setError("更新未完成，请重新检查后重试。现有任务已保留。"); setBusy(null); }
  }
  return <section className="identity-card" aria-label="应用更新">
    <div className="identity-heading"><ArrowClockwise size={20}/><strong>应用更新</strong></div>
    <p>在线下载安装新版本，保留本机任务和设置。</p>
    {update && <p role="status">{update.version ? `发现新版本 v${update.version}` : `当前 v${update.currentVersion}，已是最新版本`}</p>}
    {update?.version && update.notes && <p className="micro">{update.notes}</p>}
    <button type="button" className="secondary icon-text" disabled={busy !== null} onClick={()=>void check()}><ArrowClockwise size={17}/>{busy === "check" ? "正在检查…" : "检查更新"}</button>
    {update?.version && <button type="button" className="primary icon-text" disabled={busy !== null} onClick={()=>void install()}><DownloadSimple size={17}/>{busy === "install" ? "正在下载并安装…" : "下载安装并重启"}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
