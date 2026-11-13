import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CalendarBlank, CaretRight } from "@phosphor-icons/react";
import type { Task, TaskInput } from "./types";
import { message } from "./api";
import { deadlineLabel } from "./deadlines";
import { DatePicker } from "./DatePicker";
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
  const [dueTime, setDueTime] = useState(task?.dueTime ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [choosingDate, setChoosingDate] = useState(false);
  const dateButton = useRef<HTMLButtonElement>(null);
  const wasChoosing = useRef(false);
  useEffect(() => {
    if (!choosingDate && wasChoosing.current) dateButton.current?.focus();
    wasChoosing.current = choosingDate;
  }, [choosingDate]);
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
        dueTime: date ? dueTime : null,
        status: task?.status ?? "todo",
      });
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  if (choosingDate) return (
    <DatePicker value={date} time={dueTime}
      onClose={() => setChoosingDate(false)}
      onChange={(date, time) => { setDate(date); setDueTime(time); setChoosingDate(false); }} />
  );
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
          rows={2}
          placeholder="写下要做的事，一段话就够了…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
      </label>
      <div className="field-row task-details">
        <div className="date-field">
          <span className="field-caption">截止时间</span>
          <button type="button" ref={dateButton} className={`date-trigger ${date ? "has-date" : ""}`} aria-label={date ? `截止时间：${deadlineLabel(date, dueTime)}` : "选择截止时间"} onClick={() => setChoosingDate(true)}>
            <CalendarBlank size={18} /><span>{date ? deadlineLabel(date, dueTime) : "安排到周几"}</span><CaretRight size={14} />
          </button>
        </div>
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
    </form>
  );
}
