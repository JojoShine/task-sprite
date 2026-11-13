import { useState } from "react";
import { ArrowLeft, Check, CalendarBlank } from "@phosphor-icons/react";
import type { Task, TaskInput } from "./types";
import { message } from "./api";
export function TaskEditor({
  task,
  onSave,
  onClose,
}: {
  task?: Task;
  onSave: (input: TaskInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const initial = task
    ? task.description
      ? task.description.startsWith(task.title)
        ? task.description
        : `${task.title}\n\n${task.description}`
      : task.title
    : "";
  const [text, setText] = useState(initial);
  const [priority, setPriority] = useState<Task["priority"]>(
    task?.priority ?? "med",
  );
  const [date, setDate] = useState(task?.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSaving(true);
    setError("");
    const title = Array.from(content.split(/\r?\n/)[0]).slice(0, 200).join("");
    try {
      await onSave({
        id: task?.id,
        title,
        description: content === title ? "" : content,
        priority,
        dueDate: date || null,
        status: task?.status ?? "todo",
      });
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="editor" onSubmit={submit}>
      <div className="section-heading">
        <h2>{task ? "编辑任务" : "记下一件事"}</h2>
        <button
          type="button"
          className="text-button icon-text"
          onClick={onClose}
        >
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
      <label className="task-content-label">
        任务内容
        <textarea
          className="task-input"
          aria-label="任务内容"
          autoFocus
          maxLength={10000}
          rows={5}
          placeholder="写下要做的事，一段话就够了…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
      </label>
      <div className="field-row task-details">
        <label>
          <span className="icon-text">
            <CalendarBlank size={17} />
            截止日期
          </span>
          <input
            aria-label="截止日期"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <fieldset className="priority-field">
          <legend>优先级</legend>
          <div
            role="radiogroup"
            aria-label="优先级"
            className="priority-options"
          >
            {(
              [
                { value: "high", label: "高" },
                { value: "med", label: "中" },
                { value: "low", label: "低" },
              ] as const
            ).map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-label={`${p.label}优先级`}
                aria-checked={priority === p.value}
                className={`priority-option priority-${p.value} ${priority === p.value ? "selected" : ""}`}
                onClick={() => setPriority(p.value)}
              >
                <i />
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {date && (
        <button
          className="text-button clear-date"
          type="button"
          onClick={() => setDate("")}
        >
          清除截止日期
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="primary save icon-text"
        disabled={saving || !text.trim()}
      >
        <Check size={19} />
        {saving ? "正在保存…" : "保存任务"}
      </button>
      <p className="micro">只保存在这台电脑，无需登录。</p>
    </form>
  );
}
