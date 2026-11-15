import type { Task } from "./types";

export function isTaskPaused(task: Pick<Task, "status" | "activityLog">): boolean {
  return task.status === "todo" && task.activityLog?.at(-1)?.action === "paused";
}

// Fixed UTC+8 calendar days: 08:30–12:00 and 14:00–18:00, including weekends.
function workingMilliseconds(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const day = 86400000, offset = 8 * 3600000;
  let total = 0;
  for (let midnight = Math.floor((start + offset) / day) * day - offset; midnight < end; midnight += day) {
    for (const [from, to] of [[510, 720], [840, 1080]]) {
      total += Math.max(0, Math.min(end, midnight + to * 60000) - Math.max(start, midnight + from * 60000));
    }
  }
  return total;
}

function activeMilliseconds(intervals: Array<[number, number]>): number {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged.reduce((total, [start, end]) => total + workingMilliseconds(start, end), 0);
}

export function taskDuration(task: Pick<Task, "startedAt" | "completedAt" | "activityLog">, now = Date.now()): string {
  if (!task.startedAt && !task.activityLog?.some(event => event.action === "started" || event.action === "resumed")) return "未记录";
  const intervals: Array<[number, number]> = [];
  if (task.activityLog?.length) {
    let start: number | null = null;
    for (const event of task.activityLog) {
      const at = Date.parse(event.at);
      if (!Number.isFinite(at)) continue;
      if (event.action === "started" || event.action === "resumed") {
        if (start === null) start = at;
      } else if (start !== null && ["paused", "completed", "reopened"].includes(event.action)) {
        intervals.push([start, at]);
        start = null;
      }
    }
    if (start !== null) intervals.push([start, task.completedAt ? Date.parse(task.completedAt) : now]);
  } else {
    intervals.push([Date.parse(task.startedAt!), task.completedAt ? Date.parse(task.completedAt) : now]);
  }
  const totalMinutes = Math.floor(activeMilliseconds(intervals) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}小时` : ""}${minutes || !hours ? `${minutes}分` : ""}`;
}
