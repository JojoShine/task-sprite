import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Task } from "./types";
import { deadlineLabel } from "./deadlines";
export function TaskBubble({ tasks, focusId, caption, onOpen }: {
  tasks: Task[];
  focusId: string | null;
  caption: string | null;
  onOpen: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = Math.max(0, tasks.findIndex(task => task.id === selectedId));
  const task = tasks[index];
  const count = tasks.length;
  const move = (direction: number) => setSelectedId(tasks[(index + direction + count) % count].id);
  return (
    <div className="speech-stack" role="group" aria-label="桌面任务提示">
      {count > 2 && <span className="bubble-back back-two" aria-hidden="true" />}
      {count > 1 && <span className="bubble-back back-one" aria-hidden="true" />}
      <div className={`speech ${count > 1 ? "has-pages" : ""}`}>
        <button className="speech-content" onClick={onOpen}>
          <span>{caption ?? (task ? `${task.id === focusId ? "当前专注" : "接下来"}：${task.title}` : "今天，有什么想完成的事？")}</span>
          <small>{task ? `${task.priority === "high" ? "优先处理" : "待办"}${task.dueDate ? ` · ${deadlineLabel(task.dueDate, task.dueTime)}` : " · 随时开始"}` : "点我，记下你的下一步"}</small>
        </button>
        {count > 1 && <div className="bubble-pager">
          <button aria-label="上一项任务" onClick={() => move(-1)}><CaretLeft size={13} /></button>
          <span aria-live="polite">{index + 1} / {count}</span>
          <button aria-label="下一项任务" onClick={() => move(1)}><CaretRight size={13} /></button>
        </div>}
      </div>
    </div>
  );
}
