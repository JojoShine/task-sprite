import { describe, it, expect } from "vitest";
import { daysOverdue, groupTasks, localDay, isQuietTime } from "./domain";
import type { Task } from "./types";
const task = (
  id: string,
  dueDate: string | null,
  priority: Task["priority"] = "med",
  status: Task["status"] = "todo",
): Task => ({
  id,
  title: id,
  description: "",
  dueDate,
  dueTime: null,
  priority,
  status,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  completedAt: null,
});
describe("calendar task ordering", () => {
  it("counts calendar days across leap day and month boundaries", () => {
    expect(daysOverdue("2028-02-29", "2028-03-01")).toBe(1);
    expect(daysOverdue("2026-11-11", "2026-11-13")).toBe(2);
    expect(daysOverdue("2026-11-14", "2026-11-13")).toBe(0);
  });
  it("groups date-only tasks and excludes completed tasks", () => {
    const g = groupTasks(
      [
        task("later", "2026-11-14"),
        task("today", "2026-11-13"),
        task("old", "2026-11-10"),
        task("none", null),
        task("done", "2026-11-01", "high", "completed"),
      ],
      "2026-11-13",
    );
    expect(g.overdue.map((t) => t.id)).toEqual(["old"]);
    expect(g.today.map((t) => t.id)).toEqual(["today"]);
    expect(g.upcoming.map((t) => t.id)).toEqual(["later"]);
    expect(g.undated.map((t) => t.id)).toEqual(["none"]);
  });
  it("sorts priority then date with deterministic id tie break", () => {
    expect(
      groupTasks(
        [
          task("b", "2026-11-12"),
          task("a", "2026-11-12"),
          task("urgent", "2026-11-11", "high"),
        ],
        "2026-11-13",
      ).overdue.map((t) => t.id),
    ).toEqual(["urgent", "a", "b"]);
  });
  it("uses local calendar components rather than UTC day", () => {
    const d = new Date(2026, 10, 13, 0, 1);
    expect(localDay(d)).toBe("2026-11-13");
  });
});

it("uses configured quiet hours to decide rest animation", () => {
  expect(isQuietTime("14:00", "16:00", new Date(2026, 10, 13, 15, 0))).toBe(
    true,
  );
  expect(isQuietTime("23:00", "08:00", new Date(2026, 10, 13, 7, 59))).toBe(
    true,
  );
  expect(isQuietTime("09:00", "09:00", new Date(2026, 10, 13, 9, 0))).toBe(
    false,
  );
});
