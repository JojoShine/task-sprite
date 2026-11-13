import { localDay } from "./localDay";
export type DeadlineTime = "12:00" | "17:00";
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export function weekSlots(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const afternoon = now.getHours() >= 12 && now.getHours() < 17;
  if (now.getHours() >= 17) start.setDate(start.getDate() + 1);
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const date = localDay(d);
    return {
      date,
      label: deadlineLabel(date, null, now),
      weekday: weekdays[d.getDay()],
      shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
      times: (i === 0 && afternoon ? ["17:00"] : i === 7 && !afternoon ? ["12:00"] : ["12:00", "17:00"]) as DeadlineTime[],
    };
  });
}
export function deadlineLabel(date: string, time: string | null, now = new Date()) {
  const d = new Date(`${date}T12:00:00`);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  const weekAfter = new Date(monday); weekAfter.setDate(monday.getDate() + 14);
  const day = date === localDay(now) ? "今天" : date === localDay(tomorrow) ? "明天" : d >= monday && d < nextMonday ? weekdays[d.getDay()] : d >= nextMonday && d < weekAfter ? `下${weekdays[d.getDay()]}` : `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${day}${time ? time === "12:00" ? " 上午" : " 下午" : ""}`;
}
export function isTaskOverdue(task: { dueDate: string | null; dueTime?: string | null }, now = new Date()) {
  if (!task.dueDate) return false;
  const day = localDay(now);
  return task.dueDate < day || (task.dueDate === day && !!task.dueTime && task.dueTime <= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
}
