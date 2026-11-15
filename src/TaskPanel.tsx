import {
  Trash,
  Palette,
  GearSix,
  Plus,
  Check,
  Clock,
  CaretLeft,
  CaretRight,
  X,
  Play,
  SignOut,
  Pause,
} from "@phosphor-icons/react";
import { useState, useRef, useEffect } from "react";
import type { Snapshot, Task, VisualState } from "./types";
import { api, message } from "./api";
import { localDay, daysOverdue, groupTasks, isQuietTime } from "./domain";
import { deadlineLabel, isTaskOverdue } from "./deadlines";
import { plannedLooks, renderedPet } from "./looks";
import { Sprite, pets } from "./Pet";
import { TaskEditor } from "./TaskEditor";
import { Settings } from "./Settings";
import { Wardrobe } from "./Wardrobe";
import { isTaskPaused } from "./taskTiming";
export function TaskPanel({
  snapshot,
  onSnapshot,
  notificationWarning,
  animation,
  panelVisible = true,
}: {
  snapshot: Snapshot;
  onSnapshot: (next: Snapshot) => void;
  notificationWarning?: string;
  animation?: VisualState | null;
  panelVisible?: boolean;
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
  const [view, setView] = useState<"tasks" | "settings" | "editor" | "wardrobe">("tasks");
  const [editing, setEditing] = useState<Task>();
  const [completed, setCompleted] = useState(false);
  const taskPage = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(3);
  const [pageSelection, setPageSelection] = useState({ key: "", index: 0 });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const today = localDay();
  const groups = groupTasks(snapshot.tasks);
  const todos = Object.values(groups).flat();
  const currentTaskId = todos.find(task => task.id === snapshot.settings.focusId)?.id ?? null;
  const completedTasks = snapshot.tasks.filter(task => task.status === "completed").sort((a,b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime() || a.id.localeCompare(b.id));
  const listed = completed ? completedTasks.slice(0,15) : todos;
  useEffect(() => {
    if (panelVisible) {
      setCompleted(false);
      setPageSelection({ key: "", index: 0 });
    }
  }, [panelVisible]);
  const pageKey = completed ? "completed" : `todo:${groups.overdue.map(task => task.id).join("|")}`;
  useEffect(() => setPageSelection({ key: pageKey, index: 0 }), [pageKey, pageSize]);
  useEffect(() => {
    const area = taskPage.current;
    if (!area || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const card = area.querySelector<HTMLElement>(".task-row");
      if (!card) return;
      const minimum = parseFloat(getComputedStyle(card).minHeight) || 62;
      const cards = area.querySelector<HTMLElement>(".task-page");
      const gap = cards ? parseFloat(getComputedStyle(cards).rowGap) || 6 : 6;
      const pager = area.querySelector<HTMLElement>(".task-pager");
      const reserved = pager ? pager.offsetHeight + (parseFloat(getComputedStyle(pager).marginTop) || 0) : 0;
      setPageSize(Math.min(3, Math.max(1, Math.floor((area.clientHeight - reserved + gap) / (minimum + gap)))));
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
  async function quit() {
    setQuitting(true);
    setQuitError("");
    try {
      await api.quit();
    } catch (e) {
      setQuitError(message(e));
    } finally {
      setQuitting(false);
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
          <div className="task-title-line">
            <button className="task-title" title={task.title} onClick={() => edit(task)}>{task.title}</button>
            <button className="task-delete" aria-label={`删除任务 ${task.title}`} title="删除任务" disabled={busy === task.id} onClick={() => void act(task.id, () => api.deleteTask(task.id))}><Trash size={17} /></button>
          </div>
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
                aria-label={`${currentTaskId === task.id ? "暂停" : isTaskPaused(task) ? "继续做" : "开始做"} ${task.title}`}
                title={currentTaskId === task.id ? "暂停并保留用时，可以开始其他任务" : currentTaskId ? "请先暂停或完成正在做的任务" : "开始处理这项任务"}
                disabled={busy === task.id || (currentTaskId !== null && currentTaskId !== task.id)}
                onClick={() => void act(task.id, () => currentTaskId === task.id ? api.pause(task.id) : api.focus(task.id))}
              >
                {currentTaskId === task.id ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                {currentTaskId === task.id ? "暂停" : isTaskPaused(task) ? "继续做" : "开始做"}
              </button>
              <button
                aria-label={`稍后提醒 ${task.title}`}
                title="选择30分钟或2小时后再提醒；不改变截止时间，遵守通知和免打扰设置"
                onClick={() =>
                  setSnoozing(snoozing === task.id ? null : task.id)
                }
              >
                <Clock size={14} />
                稍后提醒
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
                      {m === 30 ? "30分钟后" : "2小时后"}
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
          </div>
        </header>
        <div className={`panel-content ${view === "tasks" && (completed ? snapshot.tasks.every(task => task.status !== "completed") : todos.length === 0) ? "empty-view" : view === "tasks" ? "paged-view" : ""} ${notificationWarning ? "has-notice" : ""}`}>
          {view === "wardrobe" ? <Wardrobe looksExpiresAt={snapshot.looksExpiresAt} onActivate={() => setView("settings")} settings={snapshot.settings} onChange={onSnapshot} onClose={() => setView("tasks")} /> : view === "editor" ? (
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
              {completed && completedTasks.length > 0 && <p className="history-note">仅展示最近15条已完成任务，更早记录可在设置中导出。</p>}
              <div className="task-list-area" ref={taskPage}>
              {completed ? (
                <div className="task-page">
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
                        pet={renderedPet(snapshot.settings.pet, snapshot.looksExpiresAt)}
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
                    <div className="task-page">{pageTasks.map(row)}</div>
                  )}
                </>
              )}
              {listed.length > 0 && <nav className="task-pager" aria-label="任务翻页">
                <button aria-label="上一页任务" disabled={pageIndex === 0} onClick={() => turnPage(pageIndex - 1)}><CaretLeft size={19} /></button>
                <span aria-live="polite">{pageIndex + 1} / {pageCount}</span>
                <button aria-label="下一页任务" disabled={pageIndex === pageCount - 1} onClick={() => turnPage(pageIndex + 1)}><CaretRight size={19} /></button>
              </nav>}
              </div>
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
        {view !== "settings" && view !== "wardrobe" && <footer className={`companions${view === "editor" ? " compact-companions" : ""}`}>
          <div className="footer-label">
            <span>今天，谁陪你？</span>
            {view === "tasks" && <button className="text-button icon-text" onClick={() => setView("wardrobe")}><Palette size={15} />更多装扮</button>}
            {view === "tasks" && <button
              className="text-button icon-text"
              aria-label="试试动作"
              aria-expanded={showActions}
              onClick={() => setShowActions(!showActions)}
            >
              <Play size={16} />
              试试动作
            </button>}
          </div>
          <div className="pet-options">
            {plannedLooks.filter(look => look.id === snapshot.settings.pet).map(look => <button key={look.id} className="pet-option selected" aria-label={`当前装扮 ${look.name}`} aria-pressed="true" onClick={() => setView("wardrobe")}>
              <Sprite pet={renderedPet(look.id, snapshot.looksExpiresAt)} state={isQuietTime(snapshot.settings.quietStart,snapshot.settings.quietEnd) ? "rest" : animation ?? (currentTaskId ? "working" : "idle")} still={snapshot.settings.reduceMotion || isQuietTime(snapshot.settings.quietStart,snapshot.settings.quietEnd)} />
              <span>{look.name}</span>
            </button>)}
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
          {view === "tasks" && showActions && (
            <div className="animation-controls" aria-label="动作预览">
              {(
                [
                  { id: "idle", label: "待机" },
                  { id: "reminder", label: "提醒" },
                  { id: "celebrate", label: "庆祝" },
                  { id: "rest", label: "休息" },
                  { id: "working", label: "工作" },
                  { id: "interaction", label: "互动" },
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
        </footer>}
        <footer className="panel-bottom-bar">
          {quitError && <span role="alert" title={quitError}>{quitError}</span>}
          <a className="powered-by" href="https://tbtparent.me" onClick={event => { event.preventDefault(); void api.openWebsite().catch(e => setQuitError(message(e))); }}>Powered by TBTParent</a>
          <button className="text-button icon-text" aria-label="退出 Task Sprite" disabled={quitting} onClick={() => void quit()}><SignOut size={15}/>{quitting ? "正在退出…" : "退出 Task Sprite"}</button>
        </footer>
      </div>
    </div>
  );
}
