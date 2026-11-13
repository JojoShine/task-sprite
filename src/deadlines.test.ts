import { it, expect } from "vitest";
import { weekSlots, deadlineLabel, isTaskOverdue } from "./deadlines";
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
