import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { Snapshot, TaskInput, Settings, VisualState, SyncStatus } from "./types";
export const api = {
  preview: (state: VisualState) => emit("preview-animation", state),
  petPosition: () =>
    invoke<[number, number]>("get_pet_position").then(([x, y]) => ({ x, y })),
  movePet: (point: { x: number; y: number }) => invoke<void>("move_pet", point),
  resizePet: (height: number) => invoke<void>("resize_pet", { height }),
  syncStatus: () => invoke<SyncStatus>("sync_status"),
  activateLicense: (code: string) => invoke<SyncStatus>("activate_license", { code }),
  pauseSync: () => invoke<SyncStatus>("pause_sync"),
  enableSync: () => invoke<SyncStatus>("enable_sync"),
  syncNow: () => invoke<SyncStatus>("sync_now"),
  deactivateLicense: () => invoke<void>("deactivate_license"),
  resolveSyncConflict: (id: string, keepLocal: boolean) => invoke<Snapshot>("resolve_sync_conflict", { id, keepLocal }),
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  deleteTask: (id: string) => invoke<Snapshot>("delete_task", { id }),
  exportTasks: () => invoke<string | null>("export_tasks"),
  save: ({ id, title, description, priority, status, dueDate, dueTime, category }: TaskInput) =>
    invoke<Snapshot>("save_task", {
      input: { id, title, description, priority, status, dueDate, dueTime, category },
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
        | "theme"
      >
    >,
  ) => invoke<Snapshot>("update_preferences", { patch }),
  focus: (id: string | null) => invoke<Snapshot>("set_focus", { id }),
  pause: (id: string) => invoke<Snapshot>("pause_task", { id }),
  snooze: (id: string, minutes: 30 | 120) =>
    invoke<void>("snooze", { id, minutes }),
  panelVisible: () => invoke<boolean>("is_panel_visible"),
  toggle: () => invoke<void>("toggle_panel"),
  hide: () => invoke<void>("hide_panel"),
  notificationStatus: () => invoke<string>("notification_status"),
  permission: () => invoke<string>("request_notifications"),
  testNotification: () => invoke<void>("test_notification"),
  openWebsite: () => invoke<void>("open_website"),
  quit: () => invoke<void>("quit"),
};
export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
