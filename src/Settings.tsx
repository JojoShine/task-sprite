import { useState } from "react";
import { ArrowLeft, Desktop, Sun, Moon, DownloadSimple } from "@phosphor-icons/react";
import type { Theme, Settings as Preferences, Snapshot } from "./types";
import { api, message } from "./api";
import { SyncSettings } from "./SyncSettings";
export function Settings({
  settings,
  onClose,
  onChange,
}: {
  settings: Preferences;
  onClose: () => void;
  onChange: (next: Snapshot) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
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
  async function changeTheme(theme: Theme) {
    setThemeBusy(true);
    setError("");
    try {
      const next = await api.preferences({ theme });
      setDraft(current => ({ ...current, theme }));
      onChange(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setThemeBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const next = await api.preferences({
        notifications: draft.notifications,
        summaryTime: draft.summaryTime,
        quietStart: draft.quietStart,
        quietEnd: draft.quietEnd,
        reduceMotion: draft.reduceMotion,
        showHint: draft.showHint,
      });
      onChange(next);
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings">
      <div className="section-heading">
        <h2>让陪伴刚刚好</h2>
        <button className="text-button icon-text" onClick={onClose}>
          <ArrowLeft size={16} />返回
        </button>
      </div>
      <fieldset className="theme-field">
        <legend>外观</legend>
        <div role="radiogroup" aria-label="外观主题" className="theme-options">
          {([{ value: "system", label: "跟随系统", Icon: Desktop }, { value: "light", label: "浅色", Icon: Sun }, { value: "dark", label: "深色", Icon: Moon }] as const).map(({ value, label, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={draft.theme === value} disabled={themeBusy} onClick={() => void changeTheme(value)}>
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
      <label className="toggle">
        系统任务提醒
        <input
          type="checkbox"
          checked={draft.notifications}
          onChange={(e) =>
            setDraft({ ...draft, notifications: e.target.checked })
          }
        />
      </label>
      <label>
        每日汇总时间
        <input
          type="time"
          value={draft.summaryTime}
          onChange={(e) => setDraft({ ...draft, summaryTime: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label>
          免打扰开始
          <input
            type="time"
            value={draft.quietStart}
            onChange={(e) => setDraft({ ...draft, quietStart: e.target.value })}
          />
        </label>
        <label>
          免打扰结束
          <input
            type="time"
            value={draft.quietEnd}
            onChange={(e) => setDraft({ ...draft, quietEnd: e.target.value })}
          />
        </label>
      </div>
      <p className="micro">开始和结束相同时，不启用免打扰。</p>
      <label className="toggle">
        显示精灵任务气泡
        <input
          type="checkbox"
          checked={draft.showHint}
          onChange={(e) => setDraft({ ...draft, showHint: e.target.checked })}
        />
      </label>
      <label className="toggle">
        减少动态效果
        <input
          type="checkbox"
          checked={draft.reduceMotion}
          onChange={(e) =>
            setDraft({ ...draft, reduceMotion: e.target.checked })
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
      <button
        className="primary save"
        disabled={busy}
        onClick={() => void save()}
      >
        保存设置
      </button>
    </div>
  );
}
