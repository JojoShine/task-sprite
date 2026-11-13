import { useState, useRef } from "react";
import { createDragSession } from "./drag";
import type { PetId, VisualState, Snapshot } from "./types";
import { groupTasks } from "./domain";
import { api } from "./api";
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
}: {
  pet: PetId;
  state?: VisualState;
  still?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
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
  celebrating,
  notice,
}: {
  snapshot: Snapshot;
  celebrating: boolean;
  notice: boolean;
}) {
  const s = snapshot.settings;
  const groups = groupTasks(snapshot.tasks);
  const ordered = Object.values(groups).flat();
  const focus = ordered.find((t) => t.id === s.focusId) ?? ordered[0];
  const drag = useRef<ReturnType<typeof createDragSession> | null>(null);
  const [dragError, setDragError] = useState("");
  const hour = new Date().getHours();
  const state: VisualState = celebrating
    ? "celebrate"
    : notice
      ? "reminder"
      : hour >= 23 || hour < 8
        ? "rest"
        : "idle";
  return (
    <div
      className="pet-view"
      onContextMenu={(e) => {
        e.preventDefault();
        void api.toggle();
      }}
    >
      {s.showHint && (
        <button className="speech" onClick={() => void api.toggle()}>
          <span>
            {celebrating
              ? "又完成一件，做得不错！"
              : focus
                ? `${s.focusId ? "当前专注" : "接下来"}：${focus.title}`
                : "今天，有什么想完成的事？"}
          </span>
          <small>
            {groups.overdue.length
              ? `${groups.overdue.length} 项已逾期`
              : "点我，记下你的下一步"}
          </small>
        </button>
      )}
      <button
        aria-label="打开任务面板，拖动可移动精灵"
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
          if (e.detail === 0 || !drag.current?.moved) void api.toggle();
        }}
      >
        <Sprite pet={s.pet} state={state} still={s.reduceMotion} />
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
