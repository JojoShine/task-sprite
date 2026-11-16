import {
  Trash,
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
  Hourglass,
  Flag,
  PushPin,
} from "@phosphor-icons/react";
import { useState, useRef, useEffect } from "react";
import type { Snapshot, Task, VisualState } from "./types";
import { api, message } from "./api";
import { localDay, daysOverdue, groupTasks, isQuietTime } from "./domain";
import { deadlineLabel, isTaskOverdue, isTaskUpcoming } from "./deadlines";
import { renderedPet } from "./looks";
import { Sprite } from "./Pet";
import { TaskEditor } from "./TaskEditor";
import { Settings } from "./Settings";
import { Wardrobe } from "./Wardrobe";
import { taskWorkflow } from "./workflow";
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
  const [view, setView] = useState<"tasks" | "settings" | "editor" | "wardrobe">("tasks");
  const [editing, setEditing] = useState<Task>();
  const [filter, setFilter] = useState<"todo" | "progress" | "completed">("todo");
  const completed = filter === "completed";
  const [focusChain, setFocusChain] = useState(false);
  const taskPage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [heightLimit, setHeightLimit] = useState(window.innerHeight);
  const requestedHeight = useRef(0);
  const [pageSize, setPageSize] = useState(6);
  const [pageSelection, setPageSelection] = useState({ key: "", index: 0 });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const today = localDay();
  const groups = groupTasks(snapshot.tasks);
  const todos = Object.values(groups).flat();
  const inProgress = todos.filter(task => taskWorkflow(snapshot, task).state !== "idle");
  const completedTasks = snapshot.tasks.filter(task => task.status === "completed").sort((a,b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime() || a.id.localeCompare(b.id));
  const listed = completed ? completedTasks.slice(0,15) : filter === "progress" ? inProgress : todos;
  useEffect(() => {
    if (panelVisible) {
      setFilter("todo");
      setPageSelection({ key: "", index: 0 });
    }
  }, [panelVisible]);
  const pageKey = completed ? "completed" : `${filter}:${groups.overdue.map(task => task.id).join("|")}`;
  useEffect(() => setPageSelection({ key: pageKey, index: 0 }), [pageKey, pageSize]);
  const pageCount = Math.max(1, Math.ceil(listed.length / pageSize));
  const pageIndex = Math.min(pageSelection.key === pageKey ? pageSelection.index : 0, pageCount - 1);
  const pageTasks = listed.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
  useEffect(() => {
    if (api.panelHeightLimit) void api.panelHeightLimit().then(setHeightLimit).catch(() => {});
  }, [panelVisible]);
  useEffect(() => {
    const resize = (height: number) => {
      const next = Math.min(heightLimit, Math.max(260, Math.ceil(height)));
      if (requestedHeight.current === next) return;
      requestedHeight.current = next;
      if (api.resizePanel) void api.resizePanel(next).catch(() => { requestedHeight.current = 0; });
    };
    if (view !== "tasks") { resize(heightLimit); return; }
    const area = taskPage.current;
    if (!area || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const cards = area.querySelector<HTMLElement>(".task-page");
      const card = area.querySelector<HTMLElement>(".task-row");
      const chrome = window.innerHeight - area.clientHeight;
      const available = Math.max(0, heightLimit - chrome);
      const gap = cards ? parseFloat(getComputedStyle(cards).rowGap) || 6 : 6;
      const pager = area.querySelector<HTMLElement>(".task-pager");
      if (card) {
        const minimum = parseFloat(getComputedStyle(card).minHeight) || 62;
        const capacity = Math.min(6, Math.max(1, Math.floor((available + gap) / (minimum + gap))));
        const reserved = listed.length > capacity ? (pager?.offsetHeight || 38) : 0;
        const size = Math.min(6, Math.max(1, Math.floor((available - reserved + gap) / (minimum + gap))));
        if (size !== pageSize) { setPageSize(size); return; }
      }
      const empty = area.querySelector<HTMLElement>(".empty, .empty-small");
      const content = cards?.scrollHeight || empty?.scrollHeight || 0;
      resize(chrome + content + (pager?.offsetHeight || 0));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    if (shell.current) observer.observe(shell.current);
    area.querySelectorAll<HTMLElement>(".task-row, .empty, .empty-small").forEach(node => observer.observe(node));
    measure();
    return () => observer.disconnect();
  }, [view, filter, snapshot, pageSize, pageIndex, heightLimit, snoozing, toast, error, notificationWarning]);
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
  async function togglePin() {
    setPinBusy(true); setPinError("");
    try { onSnapshot(await api.preferences({ panelPinned: !snapshot.settings.panelPinned })); }
    catch (e) { setPinError(message(e)); }
    finally { setPinBusy(false); }
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
  const edit = (task?: Task, chain = false) => {
    setFocusChain(chain);
    setEditing(task);
    setView("editor");
  };
  function row(task: Task) {
    const overdue = isTaskOverdue(task);
    const upcoming = isTaskUpcoming(task);
    const workflow = taskWorkflow(snapshot, task);
    const running = workflow.state === "working";
    const waiting = workflow.state === "waiting";
    const body = task.description.startsWith(task.title) ? task.description.slice(task.title.length).trimStart() : task.description;
    const overdueDays = task.dueDate ? daysOverdue(task.dueDate, today) : 0;
    return (
      <div
        className={`task-row ${task.status === "completed" ? "completed" : overdue ? "is-overdue" : upcoming ? "is-upcoming" : ""}`}
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
          {body && <p className="task-description">{body}</p>}
          <div className="task-bottom">
          <div className="task-meta">
            <span className={`priority-badge priority-${task.priority}`} aria-label={`${({high:"高",med:"中",low:"低"})[task.priority]}优先级`}><Flag size={12} weight={task.priority === "high" ? "fill" : "regular"}/>{({high:"高",med:"中",low:"低"})[task.priority]}优先级</span>
            {(running || waiting) && <span className={`execution-badge ${workflow.state}`}>{waiting ? "等待结果" : "执行中"}</span>}
            <span
              className={task.status === "todo" ? overdue ? "overdue" : upcoming ? "upcoming" : "" : ""}
            >
              {task.status === "completed"
                ? "已完成"
                : !task.dueDate
                  ? "不设截止"
                  : overdue
                    ? overdueDays ? `已逾期${overdueDays}天` : "已过截止时间"
                    : `${upcoming ? "临期 · " : ""}${deadlineLabel(task.dueDate, task.dueTime)}`}
            </span>
          </div>
          {task.status === "todo" && (
            <div className="task-actions">
              {snoozing !== task.id && <><button
                aria-label={`${running ? "暂停" : waiting || isTaskPaused(task) ? "继续做" : "开始做"} ${task.title}`}
                title={running ? "暂停当前任务，保留其他并行任务" : "开始执行，其他任务可以并行"}
                disabled={busy === task.id}
                onClick={() => void act(task.id, () => api.execution(task.id, running ? "idle" : "working"))}
              >
                {running ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                {running ? "暂停" : waiting || isTaskPaused(task) ? "继续做" : "开始做"}
              </button>
              {(running || waiting) && <button aria-label={`${waiting ? "暂停等待" : "等待结果"} ${task.title}`} title="等待结果期间停止执行计时，可同时处理其他任务" disabled={busy === task.id} onClick={() => void act(task.id, () => api.execution(task.id, waiting ? "idle" : "waiting"))}><Hourglass size={14}/>{waiting ? "暂停" : "等待"}</button>}
              {(running || waiting || workflow.steps.length > 0) && <button className="chain-entry" aria-label={`跟进记录 ${task.title}`} title="记录进展、查看跟进记录" onClick={() => edit(task, true)}><Plus size={13}/>{running || waiting ? "记录进展" : "查看跟进"}{workflow.steps.length ? ` · ${workflow.steps.length}` : ""}</button>}
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
    <div className="panel-shell" ref={shell} onPointerDownCapture={() => { void api.panelInteraction?.().catch(() => {}); }} onKeyDownCapture={() => { void api.panelInteraction?.().catch(() => {}); }} data-list={view === "tasks" && listed.length > 0 ? "paged" : undefined}>
      <div className="paper">
        <header className="topbar">
          <div className="brand">
            <img className="brand-mark" src="/companion-mark.svg" alt="" />
            <div><b>Task Sprite</b><small>你的桌面任务伙伴</small></div>
          </div>
          <div className="window-actions">
            <button className="pin-button" aria-label={snapshot.settings.panelPinned ? "取消窗口固定" : "固定任务窗口"} title={snapshot.settings.panelPinned ? "取消窗口固定，点击外部收起" : "保持任务窗口打开"} aria-pressed={!!snapshot.settings.panelPinned} disabled={pinBusy} onClick={()=>void togglePin()}><PushPin size={21} weight={snapshot.settings.panelPinned ? "fill" : "regular"}/></button>
            <button
              className="settings-button"
              aria-label="设置"
              title="设置"
              onClick={() => {
                setView(view === "settings" ? "tasks" : "settings");
              }}
            >
              <GearSix size={21} />
            </button>
          </div>
        </header>
        {pinError && <p className="pin-error" role="alert">{pinError}</p>}
        <div className={`panel-content ${view === "editor" ? "editor-view" : ""} ${view === "tasks" && listed.length === 0 ? "empty-view" : view === "tasks" ? "paged-view" : ""} ${notificationWarning ? "has-notice" : ""}`}>
          {view === "wardrobe" ? <Wardrobe looksExpiresAt={snapshot.looksExpiresAt} onActivate={() => setView("settings")} settings={snapshot.settings} onChange={onSnapshot} onClose={() => setView("settings")} /> : view === "editor" ? (
            <TaskEditor
              key={editing?.id ?? "new"}
              task={editing}
              focusChain={focusChain}
              workflow={editing ? taskWorkflow(snapshot, editing) : undefined}
              onAppendStep={editing ? async content => { onSnapshot(await api.appendStep(editing.id, content)); } : undefined}
              onDeleteStep={editing ? async stepId => { onSnapshot(await api.deleteStep(editing.id, stepId)); } : undefined}
              onSave={async (input) => {
                onSnapshot(await api.save(input));
              }}
              onClose={() => setView("tasks")}
            />
          ) : view === "settings" ? (
            <Settings
              settings={snapshot.settings}
              onWardrobe={() => setView("wardrobe")}
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
              <div className="list-tabs">
                <button
                  className={filter === "todo" ? "active" : ""}
                  onClick={() => setFilter("todo")}
                >
                  待办 {todos.length}
                </button>
                <button className={filter === "progress" ? "active" : ""} onClick={() => setFilter("progress")}>进行中 {inProgress.length}</button>
                <button
                  className={completed ? "active" : ""}
                  onClick={() => setFilter("completed")}
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
                      暂无已完成任务。
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {listed.length === 0 ? (
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
                      <h2>{filter === "progress" ? "还没有进行中的任务" : "暂无待办任务"}</h2>
                      {filter === "progress" && <p>在待办中点击开始做，多个任务可以同时进行。</p>}
                      <button className="primary" onClick={() => filter === "progress" ? setFilter("todo") : edit()}>
                        <Plus size={18} />
                        <span>{filter === "progress" ? "查看待办" : "记下第一件事"}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="task-page">{pageTasks.map(row)}</div>
                  )}
                </>
              )}
              {pageCount > 1 && <nav className="task-pager" aria-label="任务翻页">
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
                    开启提醒
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
        <footer className="panel-bottom-bar">
          {quitError && <span role="alert" title={quitError}>{quitError}</span>}
          <a className="powered-by" href="https://tbtparent.me" onClick={event => { event.preventDefault(); void api.openWebsite().catch(e => setQuitError(message(e))); }}>Powered by TBTParent</a>
          <button className="text-button icon-text" aria-label="退出 Task Sprite" disabled={quitting} onClick={() => void quit()}><SignOut size={15}/>{quitting ? "正在退出…" : "退出 Task Sprite"}</button>
        </footer>
      </div>
    </div>
  );
}
