export type FreePetId = "cat" | "shiba" | "robot" | "ghost";
export type PetId = FreePetId | "fox" | "panda" | "mint-ghost" | "sunset-robot" | "snow-shiba" | "cream-cat";
export type SkinId = "default" | "mint-ghost" | "sunset-robot" | "snow-shiba" | "cream-cat";
export type Theme = "system" | "light" | "dark";
export type VisualState = "idle" | "reminder" | "celebrate" | "rest" | "working" | "interaction";
export interface TaskActivity {
  id: string;
  action: "started" | "paused" | "resumed" | "completed" | "reopened";
  at: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  category?: "work" | "life" | null;
  priority: "high" | "med" | "low";
  status: "todo" | "completed";
  dueDate: string | null;
  dueTime: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  startedAt?: string | null;
  activityLog?: TaskActivity[];
}
export type TaskInput = Pick<
  Task,
  "title" | "description" | "priority" | "status" | "dueDate" | "dueTime"
> & {
  id?: string;
  category?: "work" | "life" | null;
};
export interface Settings {
  pet: PetId;
  skin?: SkinId;
  focusId: string | null;
  notifications: boolean;
  summaryTime: string;
  quietStart: string;
  quietEnd: string;
  reduceMotion: boolean;
  showHint: boolean;
  panelPinned?: boolean;
  cardPinned?: boolean;
  theme: Theme;
  petX: number | null;
  petY: number | null;
}
export type ExecutionState = "idle" | "working" | "waiting";
export interface TaskStep { id: string; content: string; createdAt: string; }
export interface TaskWorkflow { state: ExecutionState; steps: TaskStep[]; }
export interface Snapshot {
  platform?: string;
  workflows?: Record<string, TaskWorkflow>;
  looksExpiresAt?: string | null;
  tasks: Task[];
  settings: Settings;
}

export interface SyncChange { taskId: string; revision: number; deleted: boolean; task: (Task & { inProgress: boolean }) | null; }
export interface SyncConflict { mutationId: string; taskId: string; status: string; reason: string | null; remote: SyncChange | null; activeTask: SyncChange | null; }
export interface SpriteLicenseStatus { accountId: string; codeHint: string; expiresAt: string; deviceLimit: number; devicesUsed: number; }
export interface SyncStatus {
  deviceName?: string; license: SpriteLicenseStatus | null; bound: boolean; accountId: string | null; enabled: boolean; pending: number; conflicts: SyncConflict[]; }
