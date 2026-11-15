import { useEffect, useState } from "react";
import { ArrowsClockwise, Pause, Power } from "@phosphor-icons/react";
import { api, message } from "./api";
import type { Snapshot, SyncStatus } from "./types";
export function SyncSettings({ onChange }: { onChange: (next: Snapshot) => void }) {
  const [status, setStatus] = useState<SyncStatus>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const next = await api.syncStatus(); if (active) setStatus(next); } catch (e) { if (active) setError(message(e)); } };
    void load(); const timer = setInterval(() => void load(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="identity-card sync-card" aria-label="授权与云同步">
    <div className="identity-heading"><ArrowsClockwise size={20} /><strong>授权与云同步</strong><span>{status?.enabled ? "同步已开启" : status?.bound ? "已激活" : "仅本机"}</span></div>
    <p>默认仅在本机保存任务。电脑和微信小程序输入同一授权码，即可使用同一任务工作空间。</p>
    {!status && !error && <small>正在读取本机授权状态…</small>}
    {status && (!status.bound || recovering) && <form className="sync-license-form" onSubmit={event => { event.preventDefault(); void run(async () => {
      const restoring = status.bound;
      const next = await api.activateLicense(code);
      setStatus(next); setCode(""); setRecovering(false);
      if (restoring && next.enabled) { setStatus(await api.syncNow()); setNotice("云同步已恢复。"); }
      else setNotice(restoring ? "授权已恢复，云同步仍暂停。" : "已激活。确认合并后才会上传任务。");
    }); }}>
      <label htmlFor="cloud-license-code">授权码</label>
      <input id="cloud-license-code" type="password" autoComplete="off" spellCheck={false} value={code} disabled={busy} placeholder="TS-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={event => setCode(event.target.value)} />
      <small>{recovering ? "验证原授权码以恢复同一台电脑的同步；任务、设备名额和原同步设置保留。" : "使用官网购买后获得的授权码；默认可激活 3 台电脑，小程序不占名额。激活不会上传任务。"}</small>
      <button className="secondary" type="submit" disabled={busy || !code.trim()}>{recovering ? "验证并恢复同步" : "激活授权"}</button>
      {recovering && <button className="text-button" type="button" disabled={busy} onClick={() => { setRecovering(false); setCode(""); }}>取消</button>}
    </form>}
    {status?.license && <div className="sync-consent"><p>授权 {status.license.codeHint}</p><small>有效期至 {new Date(status.license.expiresAt).toLocaleDateString()} · 已用电脑 {status.license.devicesUsed} / {status.license.deviceLimit}</small></div>}
    {status?.bound && !status.license && <small className="sync-schedule">此电脑已激活，授权详情将在下一次成功同步后更新。</small>}
    {status?.bound && !recovering && (!status.license || error.includes("同步凭据")) && <button className="secondary" disabled={busy} onClick={() => setRecovering(true)}>恢复云同步</button>}
    {status?.bound && !status.enabled && <div className="sync-consent"><p>确认合并后，将上传本机任务，并下载此授权工作空间中的任务。遇到冲突会让你选择版本。</p><small>包含任务标题、备注、截止日期、状态、开始与完成时间。提醒设置和窗口位置保留在本机；首次合并前会自动备份。开启后立即同步，此后任务变更会自动同步。</small><button className="primary" disabled={busy} onClick={() => void run(async () => setStatus(await api.enableSync()))}>确认合并并开启同步</button></div>}
    {status?.enabled && <><small className="sync-schedule">任务变更自动同步 · 待同步修改 {status.pending} 项 · 同一工作空间最多一项正在做。</small><div className="sync-actions sync-primary-actions"><button className="secondary icon-text" disabled={busy} onClick={() => void run(async () => { setStatus(await api.pauseSync()); setNotice("已暂停同步，本机任务与此电脑的授权名额均保留。"); })}><Pause size={15} />暂停同步</button></div></>}
    {status?.bound && <div className="sync-deactivate"><button className="text-button icon-text" disabled={busy} onClick={() => setConfirmDeactivate(true)}><Power size={14} />停用此电脑</button></div>}
    {status?.conflicts.map(conflict => <div className="sync-conflict" key={conflict.taskId}><p>任务发生冲突：{conflict.remote?.task?.title || "已删除的任务"}</p><small>{conflict.reason === "another_task_in_progress" ? "云端已有任务正在做，本机任务会保留并排队。" : "两端都修改过这项任务，请选择保留的版本。"}</small><div className="sync-actions"><button className="secondary" disabled={busy} onClick={() => void run(async () => { onChange(await api.resolveSyncConflict(conflict.taskId, false)); setStatus(await api.syncNow()); })}>{conflict.reason === "another_task_in_progress" ? "保留任务，排队处理" : "保留云端"}</button>{conflict.reason !== "another_task_in_progress" && <button className="secondary" disabled={busy} onClick={() => void run(async () => { onChange(await api.resolveSyncConflict(conflict.taskId, true)); setStatus(await api.syncNow()); })}>保留本机</button>}</div></div>)}
    {confirmDeactivate && <div className="sync-conflict"><p>停用后停止同步并释放此电脑名额，本机任务会保留。需要联网完成停用。重新激活须使用原工作空间的授权码；切换工作空间需先导出任务并使用新的本地配置。</p><button className="danger" disabled={busy} onClick={() => void run(async () => { await api.deactivateLicense(); setStatus(await api.syncStatus()); setConfirmDeactivate(false); setNotice("已停用此电脑，本机任务已保留。"); })}>确认停用此电脑</button><button className="text-button" onClick={() => setConfirmDeactivate(false)}>继续使用</button></div>}
    {busy && <p className="micro">正在处理…</p>}
    {notice && <p className="micro">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
