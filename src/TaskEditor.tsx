import { useState } from "react";
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
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(
    task?.priority ?? "med",
  );
  const [date, setDate] = useState(task?.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        id: task?.id,
        title,
        description,
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
        <button type="button" className="text-button" onClick={onClose}>
          返回
        </button>
      </div>
      <label>
        任务名称
        <input
          aria-label="任务名称"
          autoFocus
          maxLength={200}
          placeholder="比如：整理本周的工作进度"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label>
        补充说明
        <textarea
          aria-label="补充说明"
          maxLength={10000}
          rows={4}
          placeholder="想清楚下一步，也可以以后再补…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="field-row">
        <label>
          截止日期
          <input
            aria-label="截止日期"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          优先级
          <select
            aria-label="优先级"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
          >
            <option value="high">优先处理</option>
            <option value="med">正常安排</option>
            <option value="low">有空再做</option>
          </select>
        </label>
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
      <button className="primary save" disabled={saving || !title.trim()}>
        {saving ? "正在保存…" : "保存任务"}
      </button>
      <p className="micro">只保存在这台电脑，无需登录。</p>
    </form>
  );
}
