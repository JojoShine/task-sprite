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
