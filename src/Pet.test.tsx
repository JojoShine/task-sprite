import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Pet } from "./Pet";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({ api: { toggle: vi.fn(async () => {}) } }));
const snapshot: Snapshot = {
  tasks: [],
  settings: {
    pet: "cat",
    focusId: null,
    notifications: true,
    summaryTime: "09:00",
    quietStart: "23:00",
    quietEnd: "08:00",
    reduceMotion: false,
    showHint: true,
    theme: "system",
    petX: null,
    petY: null,
  },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 12));
  vi.spyOn(Math, "random").mockReturnValue(0);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.mocked(api.toggle).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("responds to a single click and opens tasks only on a double click", () => {
  render(<Pet snapshot={snapshot} animation={null} />);
  const pet = screen.getByRole("button", {
    name: "点击互动，双击打开任务面板，拖动可移动精灵",
  });
  fireEvent.click(pet);
  expect(screen.getByText("摸摸头，收到啦。")).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
  fireEvent.doubleClick(pet);
  expect(api.toggle).toHaveBeenCalledTimes(1);
});

it("cycles a task stack without opening the panel and handles task removal", () => {
  const tasks = ["写报告", "回邮件", "准备会议"].map((title, i) => ({ id: String(i), title, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks }} animation={null} />);
  expect(screen.getByText(/接下来：写报告/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：回邮件/)).toBeTruthy();
  expect(screen.getByText("2 / 3")).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [tasks[0]] }} animation={null} />);
  expect(screen.getByText(/接下来：写报告/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "下一项任务" })).toBeNull();
});

it("shows an overdue task before a focused future task and marks its bubble", () => {
  const base = { description: "", status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "future", title: "明天的重点任务", priority: "high" as const, dueDate: "2026-11-14" },
    { ...base, id: "old", title: "昨天遗漏的任务", priority: "low" as const, dueDate: "2026-11-12" },
  ];
  render(<Pet snapshot={{ ...snapshot, tasks, settings: { ...snapshot.settings, focusId: "future" } }} animation={null} />);
  expect(screen.getByText(/逾期提醒：昨天遗漏的任务/)).toBeTruthy();
  expect(screen.getByText(/已逾期1天/)).toBeTruthy();
});
it("returns to an overdue bubble when a new deadline passes while viewing another task", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "one", title: "上午截止的任务", dueDate: "2026-11-13", dueTime: "12:00" },
    { ...base, id: "two", title: "明天再做", dueDate: "2026-11-14", dueTime: "17:00" },
  ];
  vi.setSystemTime(new Date(2026, 10, 13, 11, 59));
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks }} animation={null} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：明天再做/)).toBeTruthy();
  vi.setSystemTime(new Date(2026, 10, 13, 12, 1));
  rerender(<Pet snapshot={{ ...snapshot, tasks }} animation={null} />);
  expect(screen.getByText(/逾期提醒：上午截止的任务/)).toBeTruthy();
  expect(screen.getByText(/已过截止时间/)).toBeTruthy();
});

it("does not revive a future selection when an overdue task is completed then restored", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "恢复的逾期任务", dueDate: "2026-11-12" };
  const future = { ...base, id: "future", title: "未来的任务", dueDate: "2026-11-14" };
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：未来的任务/)).toBeTruthy();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [{ ...old, status: "completed" }, future] }} animation={null} />);
  rerender(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} />);
  expect(screen.getByText(/逾期提醒：恢复的逾期任务/)).toBeTruthy();
});
