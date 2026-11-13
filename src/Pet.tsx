import { useState, useRef } from "react";
import { Check, Star } from "@phosphor-icons/react";
import { TaskBubble } from "./TaskBubble";
import { createDragSession } from "./drag";
import type { PetId, VisualState, Snapshot } from "./types";
import { groupTasks, isQuietTime } from "./domain";
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
  return (
    <span
      aria-hidden="true"
      data-state={state}
      data-activity={activity ?? undefined}
      className={`sprite ${still ? "still" : ""}`}
      style={{
        backgroundImage: `url(/pets/${pet}.png)`,
        backgroundPositionX: `${(["idle", "reminder", "celebrate", "rest"].indexOf(state) * 100) / 3}%`,
      }}
    />
  );
}
export function Pet({
  snapshot,
  animation,
  onSnapshot,
}: {
  snapshot: Snapshot;
  animation: VisualState | null;
  onSnapshot: (next: Snapshot) => void;
}) {
  const s = snapshot.settings;
  const groups = groupTasks(snapshot.tasks);
  const ordered = Object.values(groups).flat();
  const focus = ordered.find((t) => t.id === s.focusId);
  const bubbleTasks = focus && groups.overdue.length === 0 ? [focus, ...ordered.filter(task => task.id !== focus.id)] : ordered;
  const drag = useRef<ReturnType<typeof createDragSession> | null>(null);
  const [dragError, setDragError] = useState("");
  const completing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [completionError, setCompletionError] = useState<{ id: string; text: string } | null>(null);
  async function completeCurrent() {
    if (!focus || completing.current) return;
    completing.current = true;
    setSaving(true);
    setCompletionError(null);
    try {
      onSnapshot(await api.save({ ...focus, status: "completed" }));
    } catch (e) {
      setCompletionError({ id: focus.id, text: message(e) });
    } finally {
      completing.current = false;
      setSaving(false);
    }
  }
  const quiet = isQuietTime(s.quietStart, s.quietEnd);
  const motion = usePetMotion({
    blocked: Boolean(animation) || quiet,
    reduced: s.reduceMotion,
    pet: s.pet,
  });
  const pose: Record<PetActivity, VisualState> = {
    peek: "idle",
    wave: "reminder",
    stretch: "celebrate",
    settle: "rest",
    tap: "celebrate",
  };
  const state: VisualState =
    animation ??
    (motion.activity ? pose[motion.activity] : quiet ? "rest" : "idle");
  return (
    <div
      className={`pet-view ${focus ? "has-current" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        void api.toggle();
      }}
    >
      {focus && (
        <div className="pet-current">
          <button
            className="pet-current-open"
            aria-label={`正在做：${focus.title}`}
            title={`正在做：${focus.title}`}
            onClick={() => void api.toggle()}
          >
            <span className="pet-current-label"><Star size={13} weight="fill" />正在做</span>
            <span className="pet-current-title" aria-live="polite">{focus.title}</span>
          </button>
          <button
            className="pet-current-complete"
            aria-label={`完成当前任务：${focus.title}`}
            title="标记完成，逾期提醒继续保留"
            disabled={saving}
            onClick={() => void completeCurrent()}
          >
            {!saving && <Check size={13} weight="bold" />}
            {saving ? "保存中" : "完成"}
          </button>
        </div>
      )}
      {focus && completionError?.id === focus.id && (
        <span className="pet-completion-error" role="alert" title={completionError.text}>完成失败，请重试</span>
      )}
      {(s.showHint || motion.caption) && (
        <TaskBubble tasks={bubbleTasks} focusId={s.focusId} caption={motion.caption ?? (animation === "celebrate" ? "给自己一点掌声，继续加油。" : null)} onOpen={() => void api.toggle()} />
      )}
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
          pet={s.pet}
          state={state}
          activity={animation ? null : motion.activity}
          still={s.reduceMotion}
        />
      </button>
      <span className="pet-count">
        待办 {ordered.length}
        <i />
        逾期 <b>{groups.overdue.length}</b>
      </span>
      {dragError && <span className="drag-error">可从菜单栏找回窗口</span>}
    </div>
  );
}
