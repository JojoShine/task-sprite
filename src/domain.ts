import type { Task } from "./types";
import { localDay } from "./localDay";
import { isTaskOverdue } from "./deadlines";
export { localDay } from "./localDay";
const dayValue = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysOverdue = (due: string, today = localDay()) =>
  Math.max(0, dayValue(today) - dayValue(due));
export function groupTasks(tasks: Task[], at: Date | string = new Date()) {
  const now = typeof at === "string" ? new Date(`${at}T00:00:00`) : at;
  const today = localDay(now);
  const groups: {
    overdue: Task[];
    today: Task[];
    upcoming: Task[];
    undated: Task[];
  } = { overdue: [], today: [], upcoming: [], undated: [] };
  const rank = { high: 0, med: 1, low: 2 };
  for (const t of tasks
    .filter((t) => t.status !== "completed")
    .sort(
      (a, b) =>
        rank[a.priority] - rank[b.priority] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59") ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )) {
    if (!t.dueDate) groups.undated.push(t);
    else if (isTaskOverdue(t, now)) groups.overdue.push(t);
    else if (t.dueDate === today) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  return groups;
}

export function isQuietTime(start: string, end: string, now = new Date()) {
  const minute = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const s = minute(start),
    e = minute(end),
    n = now.getHours() * 60 + now.getMinutes();
  return s === e ? false : s < e ? n >= s && n < e : n >= s || n < e;
}
