import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { Snapshot, TaskInput, Settings, VisualState } from "./types";
export const api = {
  preview: (state: VisualState) => emit("preview-animation", state),
  petPosition: () =>
    invoke<[number, number]>("get_pet_position").then(([x, y]) => ({ x, y })),
  movePet: (point: { x: number; y: number }) => invoke<void>("move_pet", point),
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  save: ({ id, title, description, priority, status, dueDate }: TaskInput) =>
    invoke<Snapshot>("save_task", {
      input: { id, title, description, priority, status, dueDate },
    }),
  preferences: (
    patch: Partial<
      Pick<
        Settings,
        | "pet"
        | "notifications"
        | "summaryTime"
        | "quietStart"
        | "quietEnd"
        | "reduceMotion"
        | "showHint"
      >
    >,
  ) => invoke<Snapshot>("update_preferences", { patch }),
  focus: (id: string | null) => invoke<Snapshot>("set_focus", { id }),
  snooze: (id: string, minutes: 30 | 120) =>
    invoke<void>("snooze", { id, minutes }),
  toggle: () => invoke<void>("toggle_panel"),
  hide: () => invoke<void>("hide_panel"),
  notificationStatus: () => invoke<string>("notification_status"),
  permission: () => invoke<string>("request_notifications"),
  testNotification: () => invoke<void>("test_notification"),
  quit: () => invoke<void>("quit"),
};
export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
