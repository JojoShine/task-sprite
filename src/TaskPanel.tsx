import { useState } from "react";
import type { Snapshot, Task } from "./types";
import { api, message } from "./api";
import { localDay, daysOverdue, groupTasks } from "./domain";
import { Sprite, pets } from "./Pet";
import { TaskEditor } from "./TaskEditor";
import { Settings } from "./Settings";
export function TaskPanel({
  snapshot,
  onSnapshot,
  notificationWarning,
}: {
  snapshot: Snapshot;
  onSnapshot: (next: Snapshot) => void;
  notificationWarning?: string;
}) {
  const [view, setView] = useState<"tasks" | "settings" | "editor">("tasks");
  const [editing, setEditing] = useState<Task>();
  const [completed, setCompleted] = useState(false);
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const today = localDay();
  const groups = groupTasks(snapshot.tasks, today);
  const todos = Object.values(groups).flat();
  const focus = todos.find((t) => t.id === snapshot.settings.focusId);
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
    const overdue = task.dueDate ? daysOverdue(task.dueDate, today) : 0;
    return (
      <div
        className={`task-row ${task.status === "completed" ? "completed" : ""}`}
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
          {task.status === "completed" ? "✓" : ""}
        </button>
        <div className="task-copy">
          <button className="task-title" onClick={() => edit(task)}>
            {task.title}
          </button>
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
                  ? "未设截止日"
                  : overdue
                    ? `已逾期${overdue}天`
                    : task.dueDate === today
                      ? "今天到期"
                      : `${Number(task.dueDate.slice(5, 7))}月${Number(task.dueDate.slice(8))}日`}
            </span>
          </div>
          {task.status === "todo" && (
            <div className="task-actions">
              <button
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
                {snapshot.settings.focusId === task.id
                  ? "★ 当前专注"
                  : "设为当前"}
              </button>
              <button
                onClick={() =>
                  setSnoozing(snoozing === task.id ? null : task.id)
                }
              >
                稍后提醒
              </button>
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
                      {m === 30 ? "30分钟" : "2小时"}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="panel-shell">
      <div className="paper">
        <header className="topbar">
          <div className="brand">
            <span className="pixel-star">✦</span>
            <b>Task Sprite</b>
          </div>
          <div className="window-actions">
            <button
              aria-label="设置"
              onClick={() => {
                setView(view === "settings" ? "tasks" : "settings");
              }}
            >
              ⚙
            </button>
            <button aria-label="收起面板" onClick={() => void api.hide()}>
              −
            </button>
          </div>
        </header>
        <div className="panel-content">
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
            <>
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
                  新增 ＋
                </button>
              </div>
              {completed ? (
                <div>
                  {snapshot.tasks
                    .filter((t) => t.status === "completed")
                    .map(row)}
                  {snapshot.tasks.every((t) => t.status !== "completed") && (
                    <div className="empty-small">
                      还没有完成的任务。慢慢来。
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {focus && (
                    <div className="focus-line">
                      <span>★ 当前专注</span>
                      <button onClick={() => edit(focus)}>{focus.title}</button>
                      <button
                        aria-label="取消专注"
                        onClick={() =>
                          void act(focus.id, () => api.focus(null))
                        }
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {todos.length === 0 ? (
                    <div className="empty">
                      <Sprite
                        pet={snapshot.settings.pet}
                        still={snapshot.settings.reduceMotion}
                      />
                      <h2>今天有什么想完成的事？</h2>
                      <p>把它记下来，我陪你一点点完成。</p>
                      <button className="primary" onClick={() => edit()}>
                        记下第一件事 ＋
                      </button>
                    </div>
                  ) : (
                    <>
                      {(
                        [
                          ["overdue", "已逾期"],
                          ["today", "今天到期"],
                          ["upcoming", "接下来"],
                          ["undated", "有空再安排"],
                        ] as const
                      ).map(
                        ([key, label]) =>
                          groups[key].length > 0 && (
                            <section key={key} className="task-group">
                              <h3
                                className={key === "overdue" ? "overdue" : ""}
                              >
                                {label}
                                <span>{groups[key].length}</span>
                              </h3>
                              {(all
                                ? groups[key]
                                : groups[key].slice(0, 2)
                              ).map(row)}
                            </section>
                          ),
                      )}
                      {Object.values(groups).some((g) => g.length > 2) && (
                        <button
                          className="text-button more"
                          onClick={() => setAll(!all)}
                        >
                          {all ? "收起更多任务" : "查看全部待办 ↓"}
                        </button>
                      )}
                      <div className="gentle-note">
                        <span>✦</span>
                        <p>
                          {groups.overdue.length
                            ? "先照顾到期的事，也给自己留一点余地。"
                            : "不必一次做完所有事，专注下一步就好。"}
                        </p>
                      </div>
                      <div className="bottom-actions">
                        <button className="primary" onClick={() => edit()}>
                          记下一件事
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setView("settings")}
                        >
                          提醒设置
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
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
            </>
          )}
        </div>
        <footer className="companions">
          <div className="footer-label">
            换个伙伴<span>随时陪你</span>
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
                <Sprite pet={p.id} still={true} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
