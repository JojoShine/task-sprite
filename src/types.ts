export type PetId = "cat" | "shiba" | "robot" | "ghost";
export type VisualState = "idle" | "reminder" | "celebrate" | "rest";
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: "high" | "med" | "low";
  status: "todo" | "completed";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export type TaskInput = Pick<
  Task,
  "title" | "description" | "priority" | "status" | "dueDate"
> & {
  id?: string;
};
export interface Settings {
  pet: PetId;
  focusId: string | null;
  notifications: boolean;
  summaryTime: string;
  quietStart: string;
  quietEnd: string;
  reduceMotion: boolean;
  showHint: boolean;
  petX: number | null;
  petY: number | null;
}
export interface Snapshot {
  tasks: Task[];
  settings: Settings;
}
