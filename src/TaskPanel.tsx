import {
  GearSix,
  Minus,
  Plus,
  Check,
  Star,
  Clock,
  CaretUp,
  CaretDown,
  X,
  Play,
} from "@phosphor-icons/react";
import { useState, useRef, useEffect } from "react";
import type { Snapshot, Task, VisualState } from "./types";
import { api, message } from "./api";
import { localDay, daysOverdue, groupTasks, isQuietTime } from "./domain";
import { deadlineLabel, isTaskOverdue } from "./deadlines";
import { Sprite, pets } from "./Pet";
import { TaskEditor } from "./TaskEditor";
import { Settings } from "./Settings";
export function TaskPanel({
  snapshot,
  onSnapshot,
  notificationWarning,
  animation,
}: {
  snapshot: Snapshot;
  onSnapshot: (next: Snapshot) => void;
  notificationWarning?: string;
  animation?: VisualState | null;
}) {
  const [showActions, setShowActions] = useState(false);
  const [previewStatus, setPreviewStatus] = useState("");
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    },
    [],
  );
  async function preview(state: VisualState, label: string) {
    try {
      await api.preview(state);
      setPreviewStatus(
        `正在演示${label}${snapshot.settings.reduceMotion ? "（静态姿势）" : ""}`,
      );
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreviewStatus(""), 5000);
    } catch (e) {
      setError(message(e));
    }
  }
  const [view, setView] = useState<"tasks" | "settings" | "editor">("tasks");
  const [editing, setEditing] = useState<Task>();
  const [completed, setCompleted] = useState(false);
  const taskPage = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(3);
  const [pageSelection, setPageSelection] = useState({ key: "", index: 0 });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const today = localDay();
  const groups = groupTasks(snapshot.tasks);
  const todos = Object.values(groups).flat();
  const listed = completed ? snapshot.tasks.filter(task => task.status === "completed") : todos;
  const pageKey = completed ? "completed" : `todo:${groups.overdue.map(task => task.id).join("|")}`;
  useEffect(() => setPageSelection({ key: pageKey, index: 0 }), [pageKey, pageSize]);
  useEffect(() => {
    const area = taskPage.current;
    if (!area || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const card = area.querySelector<HTMLElement>(".task-row");
      if (!card) return;
      const minimum = parseFloat(getComputedStyle(card).minHeight) || 62;
      const gap = parseFloat(getComputedStyle(area).rowGap) || 6;
      setPageSize(Math.min(3, Math.max(1, Math.floor((area.clientHeight + gap) / (minimum + gap)))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, [view, completed, listed.length]);
  const pageCount = Math.max(1, Math.ceil(listed.length / pageSize));
  const pageIndex = Math.min(pageSelection.key === pageKey ? pageSelection.index : 0, pageCount - 1);
  const pageTasks = listed.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
  const turnPage = (index: number) => { setPageSelection({ key: pageKey, index }); setSnoozing(null); };
  const date = new Date();
  const dayText = `${date.getMonth() + 1}月${date.getDate()}日 ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}`;
  async function act(id: string, work: () => Promise<Snapshot | void>) {
    setBusy(id);
    setError("");
    try {
      const next = await work();
      if (next) onSnapshot(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }
  const edit = (task?: Task) => {
    setEditing(task);
    setView("editor");
  };
  function row(task: Task) {
    const overdue = isTaskOverdue(task);
    const overdueDays = task.dueDate ? daysOverdue(task.dueDate, today) : 0;
    return (
      <div
        className={`task-row ${task.status === "completed" ? "completed" : overdue ? "is-overdue" : ""}`}
        key={task.id}
      >
        <button
          className="check"
          aria-label={
            task.status === "completed"
              ? `恢复 ${task.title}`
              : `完成 ${task.title}`
          }
          disabled={busy === task.id}
          onClick={() =>
            void act(task.id, () =>
              api.save({
                ...task,
                status: task.status === "todo" ? "completed" : "todo",
              }),
            )
          }
        >
          {task.status === "completed" ? (
            <Check size={15} weight="bold" />
          ) : null}
        </button>
        <div className="task-copy">
          <button className="task-title" title={task.title} onClick={() => edit(task)}>
            {task.title}
          </button>
          <div className="task-bottom">
          <div className="task-meta">
            <span>
              {task.priority === "high"
                ? "优先处理"
                : task.priority === "low"
                  ? "有空再做"
                  : "正常安排"}
            </span>
            <span>·</span>
            <span
              className={overdue && task.status === "todo" ? "overdue" : ""}
            >
              {task.status === "completed"
                ? "已完成"
                : !task.dueDate
                  ? "不设截止"
                  : overdue
                    ? overdueDays ? `已逾期${overdueDays}天` : "已过截止时间"
                    : deadlineLabel(task.dueDate, task.dueTime)}
            </span>
          </div>
          {task.status === "todo" && (
            <div className="task-actions">
              {snoozing !== task.id && <><button
                aria-label={`专注 ${task.title}`}
                disabled={busy === task.id}
                onClick={() =>
                  void act(task.id, () =>
                    api.focus(
                      snapshot.settings.focusId === task.id ? null : task.id,
                    ),
                  )
                }
              >
                <Star
                  size={14}
                  weight={
                    snapshot.settings.focusId === task.id ? "fill" : "regular"
                  }
                />
                {snapshot.settings.focusId === task.id
                  ? "当前"
                  : "专注"}
              </button>
              <button
                aria-label={`稍后提醒 ${task.title}`}
                onClick={() =>
                  setSnoozing(snoozing === task.id ? null : task.id)
                }
              >
                <Clock size={14} />
                稍后
              </button></>}
              {snoozing === task.id && (
                <span className="snooze-options">
                  {([30, 120] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() =>
                        void act(task.id, async () => {
                          await api.snooze(task.id, m);
                          setSnoozing(null);
                          setToast(
                            `已安排${m === 30 ? "30分钟" : "2小时"}后提醒`,
                          );
                          setTimeout(() => setToast(""), 3500);
                        })
                      }
                    >
                      {m === 30 ? "30分" : "2时"}
                    </button>
                  ))}
                  <button aria-label="取消稍后提醒选择" onClick={() => setSnoozing(null)}><X size={13} /></button>
                </span>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="panel-shell" data-list={view === "tasks" && listed.length > 0 ? "paged" : undefined}>
      <div className="paper">
        <header className="topbar">
          <div className="brand">
            <img className="brand-mark" src="/companion-mark.svg" alt="" />
            <div><b>Task Sprite</b><small>你的桌面任务伙伴</small></div>
          </div>
          <div className="window-actions">
            <button
              aria-label="设置"
              onClick={() => {
                setView(view === "settings" ? "tasks" : "settings");
              }}
            >
              <GearSix size={21} />
            </button>
            <button aria-label="收起面板" onClick={() => void api.hide()}>
              <Minus size={22} />
            </button>
          </div>
        </header>
        <div className={`panel-content ${view === "tasks" && (completed ? snapshot.tasks.every(task => task.status !== "completed") : todos.length === 0) ? "empty-view" : view === "tasks" ? "paged-view" : ""} ${notificationWarning ? "has-notice" : ""}`}>
          {view === "editor" ? (
            <TaskEditor
              key={editing?.id ?? "new"}
              task={editing}
              onSave={async (input) => {
                onSnapshot(await api.save(input));
              }}
              onClose={() => setView("tasks")}
            />
          ) : view === "settings" ? (
            <Settings
              settings={snapshot.settings}
              onClose={() => setView("tasks")}
              onChange={onSnapshot}
            />
          ) : (
            <div className="task-home">
              <div className="date-line">
                {dayText}
                <span className="local-badge">
                  <i />
                  本地已保存
                </span>
              </div>
              <h1>
                {completed
                  ? "做完的事，都算数。"
                  : groups.overdue.length
                    ? "先处理逾期的事。"
                    : todos.length
                    ? "今天，先做好这几件。"
                    : "从一件小事开始。"}
              </h1>
              <div className="list-tabs">
                <button
                  className={!completed ? "active" : ""}
                  onClick={() => setCompleted(false)}
                >
                  待办 {todos.length}
                </button>
                <button
                  className={completed ? "active" : ""}
                  onClick={() => setCompleted(true)}
                >
                  已完成 {snapshot.tasks.length - todos.length}
                </button>
                <button
                  className="text-button add-small"
                  onClick={() => edit()}
                >
                  <Plus size={16} />
                  新增
                </button>
              </div>
              {completed ? (
                <div className="task-page" ref={taskPage}>
                  {pageTasks.map(row)}
                  {snapshot.tasks.every((t) => t.status !== "completed") && (
                    <div className="empty-small">
                      还没有完成的任务。慢慢来。
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {todos.length === 0 ? (
                    <div className="empty">
                      <Sprite
                        pet={snapshot.settings.pet}
                        still={snapshot.settings.reduceMotion}
                        state={
                          animation ??
                          (isQuietTime(
                            snapshot.settings.quietStart,
                            snapshot.settings.quietEnd,
                          )
                            ? "rest"
                            : "idle")
                        }
                      />
                      <h2>今天有什么想完成的事？</h2>
                      <p>把它记下来，我陪你一点点完成。</p>
                      <button className="primary" onClick={() => edit()}>
                        <Plus size={18} />
                        <span>记下第一件事</span>
                      </button>
                    </div>
                  ) : (
                    <div className="task-page" ref={taskPage}>{pageTasks.map(row)}</div>
                  )}
                </>
              )}
              {listed.length > 0 && <nav className="task-pager" aria-label="任务翻页">
                <button aria-label="上一页任务" disabled={pageIndex === 0} onClick={() => turnPage(pageIndex - 1)}><CaretUp size={17} /><span>上一页</span></button>
                <span aria-live="polite">{pageIndex + 1} / {pageCount}</span>
                <button aria-label="下一页任务" disabled={pageIndex === pageCount - 1} onClick={() => turnPage(pageIndex + 1)}><span>下一页</span><CaretDown size={17} /></button>
              </nav>}
              {notificationWarning && (
                <p className="notification-note" role="status">
                  {notificationWarning}{" "}
                  <button
                    className="text-button"
                    onClick={() => setView("settings")}
                  >
                    提醒设置
                  </button>
                </p>
              )}
              {toast && (
                <p className="toast" role="status">
                  {toast}
                </p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
        <footer className="companions">
          <div className="footer-label">
            <span>今天，谁陪你？</span>
            <button
              className="text-button icon-text"
              aria-label="试试动作"
              aria-expanded={showActions}
              onClick={() => setShowActions(!showActions)}
            >
              <Play size={16} />
              试试动作
            </button>
          </div>
          <div className="pet-options">
            {pets.map((p) => (
              <button
                key={p.id}
                className={`pet-option ${snapshot.settings.pet === p.id ? "selected" : ""}`}
                aria-label={`选择${p.name}`}
                aria-pressed={snapshot.settings.pet === p.id}
                onClick={() =>
                  void act("pet", () => api.preferences({ pet: p.id }))
                }
              >
                <Sprite
                  pet={p.id}
                  state={
                    snapshot.settings.pet === p.id
                      ? (animation ?? "idle")
                      : "idle"
                  }
                  still={
                    snapshot.settings.pet !== p.id ||
                    !animation ||
                    snapshot.settings.reduceMotion
                  }
                />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          {showActions && (
            <div className="animation-controls" aria-label="动作预览">
              {(
                [
                  { id: "idle", label: "待机" },
                  { id: "reminder", label: "提醒" },
                  { id: "celebrate", label: "庆祝" },
                  { id: "rest", label: "休息" },
                ] as const
              ).map((a) => (
                <button
                  key={a.id}
                  aria-label={`预览${a.label}`}
                  className={animation === a.id ? "active" : ""}
                  onClick={() => void preview(a.id, a.label)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {previewStatus && (
            <p className="preview-status" role="status">
              {previewStatus} · 5秒后恢复
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
