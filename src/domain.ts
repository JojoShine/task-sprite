import type { Task } from "./types";
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayValue = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysOverdue = (due: string, today = localDay()) =>
  Math.max(0, dayValue(today) - dayValue(due));
export function groupTasks(tasks: Task[], today = localDay()) {
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
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )) {
    if (!t.dueDate) groups.undated.push(t);
    else if (t.dueDate < today) groups.overdue.push(t);
    else if (t.dueDate === today) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  return groups;
}
