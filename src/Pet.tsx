import { useState, useRef, useLayoutEffect } from "react";
import { Check, Play, Pause } from "@phosphor-icons/react";
import { plannedLooks, renderedPet } from "./looks";
import { TaskBubble } from "./TaskBubble";
import { createDragSession } from "./drag";
import type { PetId, VisualState, Snapshot, Task } from "./types";
import { groupTasks, isQuietTime, daysOverdue } from "./domain";
import { api, message } from "./api";
import { usePetMotion, type PetActivity } from "./usePetMotion";
export const pets: {
  id: PetId;
  name: string;
}[] = [
  { id: "cat", name: "橘猫" },
  { id: "shiba", name: "柴犬" },
  { id: "robot", name: "机器人" },
  { id: "ghost", name: "小幽灵" },
];
export function Sprite({
  pet,
  state = "idle",
  still = false,
  activity,
}: {
  pet: PetId;
  state?: VisualState;
  still?: boolean;
  activity?: PetActivity | null;
}) {
  const look = plannedLooks.find(item => item.id === pet);
  const base = look && "pet" in look.preview ? look.preview.pet : pet;
  const frame = state === "working" ? "idle" : state === "interaction" ? "celebrate" : state;
  const vector = pet === "fox" || pet === "panda";
  return <span aria-hidden="true" data-pet={pet} data-state={state}
    data-activity={activity ?? undefined}
    className={`sprite ${vector ? "vector-sprite" : ""} ${still ? "still" : ""}`}
    style={vector ? undefined : {
      backgroundImage: `url(/pets/${base}.png)`,
      backgroundPositionX: `${(["idle", "reminder", "celebrate", "rest"].indexOf(frame) * 100) / 3}%`,
      filter: look && "pet" in look.preview ? look.preview.filter : undefined,
    }}>
    {vector && <Character pet={pet} state={state} />}
    {!vector && state === "working" && <svg className="pose-prop" viewBox="0 0 32 32"><path fill="#493632" d="M6 23h20v6H6z"/><path fill="#f2ebdf" d="M8 23h16v3H8z"/></svg>}
    {!vector && state === "interaction" && <svg className="pose-prop" viewBox="0 0 32 32"><path fill="#e88a88" d="M23 3h3v2h2V3h3v5h-2v2h-2v2h-2v-2h-2z"/></svg>}
  </span>;
}

export function Pet({
  snapshot,
  animation,
  onSnapshot,
  panelVisible = false,
}: {
  snapshot: Snapshot;
  animation: VisualState | null;
  onSnapshot: (next: Snapshot) => void;
  panelVisible?: boolean;
}) {
  const s = snapshot.settings;
  const groups = groupTasks(snapshot.tasks);
  const ordered = Object.values(groups).flat();
  const focus = ordered.find((t) => t.id === s.focusId);
  const activeFocusId = focus?.id ?? null;
  const overdue = groups.overdue[0];
  const overdueDays = overdue?.dueDate ? daysOverdue(overdue.dueDate) : 0;
  const overdueText = overdue ? `逾期提醒：${overdue.title} · ${overdueDays ? `已逾期${overdueDays}天` : "已过截止时间"}` : "";
  const drag = useRef<ReturnType<typeof createDragSession> | null>(null);
  const [dragError, setDragError] = useState("");
  const updating = useRef(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [completionError, setCompletionError] = useState<{ id: string; text: string; action?: "start" | "pause" } | null>(null);
  async function completeTask(task: Task) {
    if (updating.current) return;
    updating.current = true;
    setSaving(true);
    setCompletionError(null);
    try {
      onSnapshot(await api.save({ ...task, status: "completed" }));
    } catch (e) {
      setCompletionError({ id: task.id, text: message(e) });
    } finally {
      updating.current = false;
      setSaving(false);
    }
  }
  async function startTask(task: Task) {
    if (focus || updating.current) return;
    updating.current = true;
    setStarting(true);
    setCompletionError(null);
    try {
      onSnapshot(await api.focus(task.id));
    } catch (e) {
      setCompletionError({ id: task.id, text: message(e), action: "start" });
    } finally {
      updating.current = false;
      setStarting(false);
    }
  }
  async function pauseTask(task: Task) {
    if (updating.current) return;
    updating.current = true;
    setPausing(true);
    setCompletionError(null);
    try {
      onSnapshot(await api.pause(task.id));
    } catch (e) {
      setCompletionError({ id: task.id, text: message(e), action: "pause" });
    } finally {
      updating.current = false;
      setPausing(false);
    }
  }
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!view.current || typeof ResizeObserver === "undefined") return;
    let cancelled = false;
    let previous = 0;
    let queue = Promise.resolve();
    const resize = () => {
      const height = Math.max(230, Math.ceil(view.current!.getBoundingClientRect().height));
      if (height === previous) return;
      previous = height;
      queue = queue.then(async () => {
        if (!cancelled) await api.resizePet(height);
      }).catch(e => { if (!cancelled) setDragError(message(e)); });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(view.current);
    resize();
    return () => { cancelled = true; observer.disconnect(); };
  }, []);
  const quiet = isQuietTime(s.quietStart, s.quietEnd);
  const motion = usePetMotion({
    blocked: Boolean(animation) || quiet,
    reduced: s.reduceMotion,
    pet: renderedPet(s.pet, snapshot.looksExpiresAt),
  });
  const pose: Record<PetActivity, VisualState> = {
    peek: "idle",
    wave: "reminder",
    stretch: "celebrate",
    settle: "rest",
    tap: "interaction",
  };
  const paused = snapshot.tasks.some(task => task.status === "todo" && task.activityLog?.at(-1)?.action === "paused");
  const state: VisualState = quiet ? "rest" : animation ??
    (motion.activity === "tap" ? "interaction" : focus ? "working" : paused ? "rest" : motion.activity ? pose[motion.activity] : "idle");
  return (
    <div
      className="pet-view"
      ref={view}
      onContextMenu={(e) => {
        e.preventDefault();
        void api.toggle();
      }}
    >
      <div className="pet-card">
      {!panelVisible && focus && (
        <div className="pet-current" role="group" aria-label="当前任务卡片">
          <div className="pet-current-main">
            <button
              className="pet-current-open"
              aria-label={`正在做：${focus.title}`}
              title={`正在做：${focus.title}`}
              onClick={() => void api.toggle()}
            >
              <span className="pet-current-label task-state-label"><Play size={12} weight="fill" />正在做</span>
              <span className="pet-current-title" aria-live="polite">{focus.title}</span>
            </button>
            <div className="pet-current-actions">
            <button className="pet-current-complete" aria-label={`暂停当前任务：${focus.title}`} title="暂停并保留用时" disabled={saving || starting || pausing} onClick={() => void pauseTask(focus)}>
              {!pausing && <Pause size={13} weight="fill" />}{pausing ? "暂停中" : "暂停"}
            </button>
            <button
              className="pet-current-complete"
              aria-label={`完成当前任务：${focus.title}`}
              title="标记完成，逾期提醒继续保留"
              disabled={saving || starting || pausing}
              onClick={() => void completeTask(focus)}
            >
              {!saving && <Check size={13} weight="bold" />}
              {saving ? "保存中" : "完成"}
            </button>
            </div>
          </div>
          {overdue && <div className="pet-current-overdue">
            <button className="pet-overdue-open" title={overdue.title} aria-label={overdueText} onClick={() => void api.toggle()}>
              <span className="task-state-label is-overdue">逾期提醒</span>
              <span className="pet-overdue-title" aria-live="polite">{overdue.title}</span>
              <small>{overdueDays ? `已逾期${overdueDays}天` : "已过截止时间"}</small>
            </button>
            {overdue.id !== focus.id && <button className="pet-current-complete pet-start" aria-label={`开始做：${overdue.title}`} title="请先暂停或完成正在做的任务" disabled={Boolean(focus) || saving || starting || pausing} onClick={() => void startTask(overdue)}>
              {!starting && <Play size={13} weight="fill" />}{starting ? "开始中" : "开始做"}
            </button>}
          </div>}
          {completionError && (completionError.id === focus.id || completionError.id === overdue?.id) && <span className="pet-completion-error" role="alert" title={completionError.text}>{completionError.action === "start" ? "开始失败，请重试" : completionError.action === "pause" ? "暂停失败，请重试" : "完成失败，请重试"}</span>}
        </div>
      )}
      {!panelVisible && !focus && (s.showHint || motion.caption) && (
        <TaskBubble tasks={ordered} focusId={activeFocusId} caption={motion.caption ?? (animation === "celebrate" ? "给自己一点掌声，继续加油。" : null)} onOpen={() => void api.toggle()} onComplete={completeTask} onStart={startTask} saving={saving} starting={starting} completionError={completionError} />
      )}
      </div>
      <button
        aria-label="点击互动，双击打开任务面板，拖动可移动精灵"
        className="pet-drag"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = createDragSession(
            { x: e.screenX, y: e.screenY },
            api.petPosition(),
            api.movePet,
          );
        }}
        onPointerMove={(e) => {
          if (drag.current && e.buttons === 1)
            void drag.current
              .update({ x: e.screenX, y: e.screenY })
              .catch((e) => setDragError(String(e)));
        }}
        onPointerUp={(e) => {
          if (drag.current)
            void drag.current
              .update({ x: e.screenX, y: e.screenY })
              .catch((e) => setDragError(String(e)));
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onClick={(e) => {
          if (e.detail === 0 || !drag.current?.moved) motion.interact();
        }}
        onDoubleClick={() => void api.toggle()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void api.toggle();
          }
        }}
      >
        <Sprite
          key={motion.sequence}
          pet={renderedPet(s.pet, snapshot.looksExpiresAt)}
          state={state}
          activity={animation || state === "working" || state === "rest" ? null : motion.activity}
          still={s.reduceMotion || quiet}
        />
      </button>
      <span className="pet-count" role="status" aria-label={`任务底座：待办${ordered.length}项，逾期${groups.overdue.length}项`}>
        <span>待办 <strong>{ordered.length}</strong></span>
        <i />
        <span>逾期 <b>{groups.overdue.length}</b></span>
      </span>
      {dragError && <span className="drag-error">可从菜单栏找回窗口</span>}
    </div>
  );
}

const characterArt = {fox: '<path fill="#493632" d="M5 3h5v2h2v3h8V5h2V3h5v11h2v5h-2v3h-2v7H7v-4H5v-4H3v-9h2z"/>\n<path fill="#bc693d" d="M23 19h3v-3h4v3h2v7h-2v3h-9v-5h2z"/>\n<path fill="#f4dfbd" d="M28 18h2v3h2v4h-4z"/>\n<path fill="#e39a53" d="M7 5h2v5h14V5h2v10h2v4h-2v3H7v-3H5v-6h2zM9 21h14v6H9z"/>\n<path fill="#a3583c" d="M8 6h1v4H7V7h1zm15 0h1v4h-2V8h1z"/>\n<path fill="#f6e4c5" d="M6 15h5v2h3v2h4v-2h3v-2h5v5h-3v3H9v-3H6zM12 23h8v4h-8z"/>\n<path fill="#493632" d="M10 13h2v3h-2zm10 0h2v3h-2zm-6 5h4v2h-4zm1 2h2v2h-2zM9 27h4v2H9zm10 0h4v2h-4z"/>\n<path fill="#f5b394" d="M7 17h3v2H7zm15 0h3v2h-3z"/>', panda: '<path fill="#34383e" d="M5 4h6v2h10V4h6v7h2v11h-3v7h-8v-2h-4v2H6v-7H3V11h2z"/>\n<path fill="#f2ebdf" d="M10 7h12v2h4v3h2v8h-3v3H7v-3H4v-8h2V9h4zM10 22h12v5H10z"/>\n<path fill="#34383e" d="M8 11h5v5H8zm11 0h5v5h-5zM7 22h4v5H7zm14 0h4v5h-4zM14 17h4v2h-4zm1 2h2v2h-2z"/>\n<path fill="#fffdf6" d="M10 12h2v2h-2zm10 0h2v2h-2z"/>\n<path fill="#d8b9ac" d="M6 17h4v2H6zm16 0h4v2h-4z"/>\n<path fill="#c8cfbd" d="M25 22h2v6h-2zM24 23h4v2h-4z"/>'};
function Character({pet,state}: {pet: "fox" | "panda"; state: VisualState}) {
  const ink = pet === "fox" ? "#493632" : "#34383e";
  const fur = pet === "fox" ? "#e39a53" : "#f2ebdf";
  return <svg viewBox="0 0 32 36" shapeRendering="crispEdges">
    <g className="character-body" transform={state === "rest" ? "translate(0 7) scale(1 .78)" : state === "celebrate" ? "translate(0 -1)" : undefined}>
      <g dangerouslySetInnerHTML={{__html:characterArt[pet]}} />
      {state === "rest" && <><path fill={fur} d="M8 12h6v4H8zm10 0h6v4h-6z"/><path fill={ink} d="M9 14h4v1H9zm10 0h4v1h-4z"/></>}
      <path className="character-arm" fill={ink} d={state === "interaction" || state === "reminder" ? "M25 13h3v-3h3v9h-6z" : state === "celebrate" ? "M2 13h4v7H2zm24 0h4v7h-4z" : state === "working" ? "M5 21h5v5H5zm17 0h5v5h-5z" : "M5 21h3v5H5zm19 0h3v5h-3z"}/>
    </g>
    {state === "working" && <g><path fill={ink} d="M5 27h22v5H5z"/><path fill="#c8cfbd" d="M8 20h16v8H8z"/><path fill="#f2ebdf" d="M10 22h12v4H10z"/></g>}
    {state === "rest" && <path fill="#a7b5cb" d="M25 3h5v1h-2v1h-2v1h4v1h-5V6h1V5h2V4h-3z"/>}
    {state === "reminder" && <path fill="#e39a53" d="M28 1h2v5h-2zm0 7h2v2h-2z"/>}
    {state === "celebrate" && <path fill="#e9bd60" d="M2 2h2v2h2v2H4v2H2V6H0V4h2zm24 0h2v2h2v2h-2v2h-2V6h-2V4h2z"/>}
    {state === "interaction" && <path fill="#e88a88" d="M19 1h3v2h2V1h3v5h-2v2h-2v2h-2V8h-2z"/>}
  </svg>;
}
