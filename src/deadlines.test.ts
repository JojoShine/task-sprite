import { it, expect } from "vitest";
import { weekSlots, deadlineLabel, isTaskOverdue, isTaskUpcoming } from "./deadlines";
it("offers Monday morning through next Monday morning", () => {
  const days = weekSlots(new Date(2026, 10, 16, 9));
  expect(days).toHaveLength(8);
  expect(days[0]).toMatchObject({ date: "2026-11-16", label: "今天", times: ["12:00", "17:00"] });
  expect(days[7]).toMatchObject({ date: "2026-11-23", label: "下周一", times: ["12:00"] });
});
it("starts at this afternoon and includes next Monday afternoon", () => {
  const days = weekSlots(new Date(2026, 10, 16, 12));
  expect(days[0].times).toEqual(["17:00"]);
  expect(days[7].times).toEqual(["12:00", "17:00"]);
});
it("rolls forward at exactly 17:00 through next Tuesday morning", () => {
  expect(weekSlots(new Date(2026, 10, 16, 16, 59))[0].date).toBe("2026-11-16");
  const days = weekSlots(new Date(2026, 10, 16, 17));
  expect(days[0]).toMatchObject({ date: "2026-11-17", label: "明天", times: ["12:00", "17:00"] });
  expect(days[7]).toMatchObject({ date: "2026-11-24", label: "下周二", times: ["12:00"] });
});
it("uses calendar days across year and leap boundaries", () => {
  expect(weekSlots(new Date(2026, 11, 31, 18))[0].date).toBe("2027-01-01");
  expect(weekSlots(new Date(2028, 1, 28, 18))[0].date).toBe("2028-02-29");
});
it("marks an afternoon deadline overdue at 17:00 but retains legacy all-day dates", () => {
  const task = { dueDate: "2026-11-16", dueTime: "17:00" };
  expect(isTaskOverdue(task, new Date(2026, 10, 16, 16, 59))).toBe(false);
  expect(isTaskOverdue(task, new Date(2026, 10, 16, 17))).toBe(true);
  expect(isTaskOverdue({ ...task, dueTime: null }, new Date(2026, 10, 16, 23))).toBe(false);
  expect(deadlineLabel("2026-11-23", "12:00", new Date(2026, 10, 16, 9))).toBe("下周一 上午");
});

it("labels every date by the calendar week rather than only the last slot", () => {
  const now = new Date(2026, 10, 13, 20);
  expect(weekSlots(now).map(d => d.label)).toEqual(["明天", "周日", "下周一", "下周二", "下周三", "下周四", "下周五", "下周六"]);
  for (const d of weekSlots(now)) expect(d.label).toBe(deadlineLabel(d.date, null, now));
  expect(weekSlots(new Date(2026, 11, 31, 20)).find(d => d.date === "2027-01-04")?.label).toBe("下周一");
});

it("warns from the previous calendar day even when more than 24 hours remain", () => {
  const task = { dueDate: "2026-11-17", dueTime: "17:00", status: "todo" as const };
  expect(isTaskUpcoming(task, new Date(2026, 10, 15, 23, 59))).toBe(false);
  expect(isTaskUpcoming(task, new Date(2026, 10, 16, 0))).toBe(true);
  expect(isTaskUpcoming(task, new Date(2026, 10, 16, 9))).toBe(true);
  expect(isTaskUpcoming(task, new Date(2026, 10, 17, 16, 59))).toBe(true);
  expect(isTaskUpcoming(task, new Date(2026, 10, 17, 17))).toBe(false);
  expect(isTaskUpcoming(task, new Date(2026, 10, 18))).toBe(false);
});
it("does not warn for completed or undated tasks and keeps legacy all-day deadlines", () => {
  const now = new Date(2026, 10, 16, 23, 59);
  expect(isTaskUpcoming({dueDate: null}, now)).toBe(false);
  expect(isTaskUpcoming({dueDate: "2026-11-17", status:"completed"}, now)).toBe(false);
  expect(isTaskUpcoming({dueDate: "2026-11-16", dueTime:null}, now)).toBe(true);
});
it("uses the local calendar across year and leap day warning boundaries", () => {
  expect(isTaskUpcoming({dueDate:"2027-01-01"}, new Date(2026,11,31,0))).toBe(true);
  expect(isTaskUpcoming({dueDate:"2028-03-01"}, new Date(2028,1,28,23,59))).toBe(false);
  expect(isTaskUpcoming({dueDate:"2028-03-01"}, new Date(2028,1,29,0))).toBe(true);
});
