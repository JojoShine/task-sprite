import { useEffect, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Task } from "./types";
import { daysOverdue } from "./domain";
import { isTaskOverdue, deadlineLabel } from "./deadlines";
export function TaskBubble({ tasks, focusId, caption, onOpen }: {
  tasks: Task[];
  focusId: string | null;
  caption: string | null;
  onOpen: () => void;
}) {
  const overdueKey = tasks.filter(task => isTaskOverdue(task)).map(task => task.id).join("|");
  const [selection, setSelection] = useState({ id: null as string | null, overdueKey });
  useEffect(() => setSelection({ id: null, overdueKey }), [overdueKey]);
  const index = Math.max(0, tasks.findIndex(task => task.id === (selection.overdueKey === overdueKey ? selection.id : null)));
  const task = tasks[index];
  const count = tasks.length;
  const move = (direction: number) => setSelection({ id: tasks[(index + direction + count) % count].id, overdueKey });
  const overdue = task && isTaskOverdue(task);
  const overdueDays = task?.dueDate ? daysOverdue(task.dueDate) : 0;
  const priority = task?.priority === "high" ? "高优先级" : task?.priority === "low" ? "低优先级" : "中优先级";
  return (
    <div className="speech-stack" role="group" aria-label="桌面任务提示">
      {count > 2 && <span className="bubble-back back-two" aria-hidden="true" />}
      {count > 1 && <span className="bubble-back back-one" aria-hidden="true" />}
      <div className={`speech ${task ? "has-task" : ""} ${count > 1 ? "has-pages" : ""} ${overdue ? "is-overdue" : ""}`}>
        <button className="speech-content" title={task?.title} onClick={onOpen}>
          <span aria-live="polite">{caption ?? (task ? `${overdue ? "逾期提醒" : task.id === focusId ? "正在做" : "接下来"}：${task.title}` : "今天，有什么想完成的事？")}</span>
          <small>{task ? `${priority} · ${overdue ? overdueDays ? `已逾期${overdueDays}天` : "已过截止时间" : task.dueDate ? deadlineLabel(task.dueDate, task.dueTime) : "随时开始"}` : "点我，记下你的下一步"}</small>
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
