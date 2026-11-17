import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Desktop, Sun, Moon, DownloadSimple } from "@phosphor-icons/react";
import type { Settings as Preferences, Snapshot } from "./types";
import { api, message } from "./api";
import { CompanionSettings } from "./CompanionSettings";
import { SyncSettings } from "./SyncSettings";
export function Settings({
  settings,
  onClose,
  onChange,
  onWardrobe,
  section,
}: {
  settings: Preferences;
  onClose: () => void;
  onChange: (next: Snapshot) => void;
  onWardrobe?: () => void;
  section?: "reminders";
}) {
  const reminders = useRef<HTMLElement>(null);
  useEffect(() => { if(section === "reminders") reminders.current?.scrollIntoView?.({block:"start"}); }, [section]);
  const [draft, setDraft] = useState(settings);
  useEffect(() => { setDraft(current => ({...current, cardPinned:settings.cardPinned ?? false})); }, [settings.cardPinned]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState("");
  async function exportTasks() {
    setExportBusy(true);
    setExportStatus("");
    setExportError("");
    try {
      const path = await api.exportTasks();
      if (path) setExportStatus(`已导出到 ${path}`);
    } catch (e) {
      setExportError(message(e));
    } finally {
      setExportBusy(false);
    }
  }
  async function update(patch: Parameters<typeof api.preferences>[0]) {
    if (busy) return;
    const previous = draft;
    setBusy(true);
    setError("");
    setDraft(current => ({ ...current, ...patch }));
    try { onChange(await api.preferences(patch)); }
    catch (e) { setDraft(previous); setError(message(e)); }
    finally { setBusy(false); }
  }
  function changeTime(field: "summaryTime" | "quietStart" | "quietEnd", value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) void update({ [field]: value });
  }
  return (
    <div className="settings">
      <div className="section-heading">
        <h2>设置</h2>
        <button className="text-button icon-text" onClick={onClose}>
          <ArrowLeft size={16} />返回
        </button>
      </div>
      <section className="reminder-settings" aria-label="任务提醒" ref={reminders}>
        <h3>任务提醒</h3>
        <p className="micro">到期前2小时开始提醒，之后每30分钟一次。自动弹窗20秒后收起，正在编辑时保留。</p>
      <label className="toggle">
        系统任务提醒
        <input
          disabled={busy}
          type="checkbox"
          checked={draft.notifications}
          onChange={(e) =>
            void update({ notifications: e.target.checked })
          }
        />
      </label>
      <div className="field-row">
        <label>
          免打扰开始
          <input
            disabled={busy}
          type="time"
            value={draft.quietStart}
            onChange={(e) => changeTime("quietStart", e.target.value)}
            onBlur={() => { if (!draft.quietStart) setDraft(current => ({...current, quietStart:settings.quietStart})); }}
          />
        </label>
        <label>
          免打扰结束
          <input
            disabled={busy}
          type="time"
            value={draft.quietEnd}
            onChange={(e) => changeTime("quietEnd", e.target.value)}
            onBlur={() => { if (!draft.quietEnd) setDraft(current => ({...current, quietEnd:settings.quietEnd})); }}
          />
        </label>
      </div>
      <p className="micro">开始和结束相同时，不启用免打扰。</p>
      <label className="toggle">
        减少动态效果
        <input
          disabled={busy}
          type="checkbox"
          checked={draft.reduceMotion}
          onChange={(e) =>
            void update({ reduceMotion: e.target.checked })
          }
        />
      </label>
      <button
        className="secondary"
        onClick={async () => {
          try {
            const permission = await api.permission();
            if (permission !== "granted")
              throw new Error(
                "通知权限未开启，请在系统设置中允许 Task Sprite 通知。",
              );
            await api.testNotification();
            setStatus(
              "系统已接受测试提醒。若未出现，请检查系统专注模式或通知横幅设置。",
            );
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        发送一条测试提醒
      </button>
      <p className="micro">关闭任务面板后仍会提醒；退出应用后停止。</p>
      </section>
      <section className="window-settings" aria-label="桌宠任务卡">
        <h3>桌宠任务卡</h3>
        <label className="toggle">固定任务卡<input type="checkbox" checked={draft.cardPinned ?? false} disabled={busy} onChange={e=>void update({cardPinned:e.target.checked})}/></label>
        <p className="micro">只固定机器人上方的小卡片，任务窗口打开或关闭都不影响它；关闭此开关即可收起小卡片。</p>
      </section>
      <CompanionSettings settings={settings} onChange={onChange} onWardrobe={onWardrobe}/>
      <fieldset className="theme-field">
        <legend>外观</legend>
        <div role="radiogroup" aria-label="外观主题" className="theme-options">
          {([{ value: "system", label: "跟随系统", Icon: Desktop }, { value: "light", label: "浅色", Icon: Sun }, { value: "dark", label: "深色", Icon: Moon }] as const).map(({ value, label, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={draft.theme === value} disabled={busy} onClick={() => void update({theme:value})}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <SyncSettings onChange={onChange} />
      <section className="identity-card export-card" aria-label="导出任务">
        <div className="identity-heading"><DownloadSimple size={20} /><strong>导出任务</strong></div>
        <p>导出全部待办与已完成任务，保留所有任务属性。</p>
        <small>包含创建时间、优先级、状态、计划与实际完成时间；时间注明本地时区。</small>
        <button type="button" className="secondary icon-text" disabled={exportBusy} onClick={() => void exportTasks()}><DownloadSimple size={17} />{exportBusy ? "正在导出…" : "导出全部任务 CSV"}</button>
        {exportStatus && <p className="micro" role="status">{exportStatus}</p>}
        {exportError && <p className="error" role="alert">{exportError}</p>}
      </section>
      {status && (
        <p role="status" className="micro">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
