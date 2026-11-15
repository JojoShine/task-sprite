import { useEffect, useState } from "react";
import { CaretLeft, CaretRight, Check, Play } from "@phosphor-icons/react";
import type { Task } from "./types";
import { isTaskPaused } from "./taskTiming";
import { daysOverdue } from "./domain";
import { isTaskOverdue, deadlineLabel } from "./deadlines";
export function TaskBubble({ tasks, focusId, caption, onOpen, onComplete, onStart, saving, starting, completionError }: {
  tasks: Task[];
  focusId: string | null;
  caption: string | null;
  onOpen: () => void;
  onComplete: (task: Task) => Promise<void>;
  onStart: (task: Task) => Promise<void>;
  saving: boolean;
  starting: boolean;
  completionError: { id: string; text: string; action?: "start" | "pause" } | null;
}) {
  const overdueKey = tasks.filter(task => isTaskOverdue(task)).map(task => task.id).join("|");
  const [selection, setSelection] = useState({ id: null as string | null, overdueKey });
  useEffect(() => setSelection({ id: null, overdueKey }), [overdueKey]);
  const index = Math.max(0, tasks.findIndex(task => task.id === (selection.overdueKey === overdueKey ? selection.id : null)));
  const task = tasks[index];
  const count = tasks.length;
  const taskIds = tasks.map(task => task.id).join("|");
  const hasFocus = tasks.some(task => task.id === focusId);
  useEffect(() => {
    if (hasFocus || count < 2 || saving || starting) return;
    const timer = setTimeout(() => {
      setSelection({ id: tasks[(index + 1) % count].id, overdueKey });
    }, 10_000);
    return () => clearTimeout(timer);
  }, [task?.id, taskIds, overdueKey, hasFocus, saving, starting]);
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
          {task && <span className={`task-state-label${overdue ? " is-overdue" : ""}`}>{overdue ? "逾期提醒" : task.id === focusId ? "正在做" : isTaskPaused(task) ? "已暂停" : "接下来"}</span>}
          <span className="task-bubble-title" aria-live="polite">{task?.title ?? caption ?? "今天，有什么想完成的事？"}</span>
          <small>{task ? `${priority} · ${overdue ? overdueDays ? `已逾期${overdueDays}天` : "已过截止时间" : task.dueDate ? deadlineLabel(task.dueDate, task.dueTime) : "随时开始"}` : "点我，记下你的下一步"}</small>
        </button>
        {task && <div className="bubble-actions">
          <div className="bubble-primary-actions">
            {task.id !== focusId && <button className="pet-current-complete pet-start" aria-label={`${isTaskPaused(task) ? "继续做" : "开始做"}：${task.title}`} title={hasFocus ? "请先暂停或完成正在做的任务" : "开始处理这项任务"} disabled={saving || starting || hasFocus} onClick={() => void onStart(task)}>
              {!starting && <Play size={13} weight="fill" />}{starting ? "开始中" : isTaskPaused(task) ? "继续做" : "开始做"}
            </button>}
          <button className="pet-current-complete" aria-label={`完成任务：${task.title}`} disabled={saving || starting} onClick={() => void onComplete(task)}>
            {!saving && <Check size={13} weight="bold" />}{saving ? "保存中" : "完成"}
          </button>
          </div>
        {count > 1 && <div className="bubble-pager">
          <button aria-label="上一项任务" disabled={saving || starting} onClick={() => move(-1)}><CaretLeft size={13} /></button>
          <span aria-live="polite">{index + 1} / {count}</span>
          <button aria-label="下一项任务" disabled={saving || starting} onClick={() => move(1)}><CaretRight size={13} /></button>
        </div>}
        </div>}
        {task && completionError?.id === task.id && <span className="pet-completion-error" role="alert" title={completionError?.text}>{completionError.action === "start" ? "开始失败，请重试" : "完成失败，请重试"}</span>}
      </div>
    </div>
  );
}
