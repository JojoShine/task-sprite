import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Pet } from "./Pet";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({ api: { toggle: vi.fn(async () => {}), save: vi.fn() }, message: (e: unknown) => e instanceof Error ? e.message : String(e) }));
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
  vi.mocked(api.save).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("responds to a single click and opens tasks only on a double click", () => {
  render(<Pet snapshot={snapshot} animation={null} onSnapshot={() => {}} />);
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
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/接下来：写报告/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：回邮件/)).toBeTruthy();
  expect(screen.getByText("2 / 3")).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [tasks[0]] }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/接下来：写报告/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "下一项任务" })).toBeNull();
});

it("shows an overdue task before a focused future task and marks its bubble", () => {
  const base = { description: "", status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "future", title: "明天的重点任务", priority: "high" as const, dueDate: "2026-11-14" },
    { ...base, id: "old", title: "昨天遗漏的任务", priority: "low" as const, dueDate: "2026-11-12" },
  ];
  render(<Pet snapshot={{ ...snapshot, tasks, settings: { ...snapshot.settings, focusId: "future" } }} animation={null} onSnapshot={() => {}} />);
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
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks }} animation={null} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：明天再做/)).toBeTruthy();
  vi.setSystemTime(new Date(2026, 10, 13, 12, 1));
  rerender(<Pet snapshot={{ ...snapshot, tasks }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/逾期提醒：上午截止的任务/)).toBeTruthy();
  expect(screen.getByText(/已过截止时间/)).toBeTruthy();
});

it("does not revive a future selection when an overdue task is completed then restored", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "恢复的逾期任务", dueDate: "2026-11-12" };
  const future = { ...base, id: "future", title: "未来的任务", dueDate: "2026-11-14" };
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/接下来：未来的任务/)).toBeTruthy();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [{ ...old, status: "completed" }, future] }} animation={null} onSnapshot={() => {}} />);
  rerender(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/逾期提醒：恢复的逾期任务/)).toBeTruthy();
});


it("uses one current card with an overdue reminder and returns to the bubble on completion", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "待补交的周报", dueDate: "2026-11-12" };
  const current = { ...base, id: "current", title: "整理明天的计划", dueDate: "2026-11-14" };
  const settings = { ...snapshot.settings, focusId: current.id };
  const { rerender } = render(<Pet snapshot={{ tasks: [old, current], settings }} animation={null} onSnapshot={() => {}} />);
  const currentTask = screen.getByRole("button", { name: "正在做：整理明天的计划" });
  expect(screen.getByText(/逾期提醒：待补交的周报/)).toBeTruthy();
  expect(screen.getByRole("group", { name: "当前任务卡片" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "桌面任务提示" })).toBeNull();
  expect(screen.getByRole("status", { name: "任务底座：待办2项，逾期1项" })).toBeTruthy();
  fireEvent.click(currentTask);
  expect(api.toggle).toHaveBeenCalledTimes(1);
  rerender(<Pet snapshot={{ tasks: [old, { ...current, status: "completed" }], settings }} animation={null} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", { name: "正在做：整理明天的计划" })).toBeNull();
  expect(screen.queryByRole("group", { name: "当前任务卡片" })).toBeNull();
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  expect(screen.getByRole("status", { name: "任务底座：待办1项，逾期1项" })).toBeTruthy();
  expect(screen.getByText(/逾期提醒：待补交的周报/)).toBeTruthy();
});

it("shows the current task even with hints hidden and removes it when unselected", () => {
  const task = { id: "current", title: "正在整理的资料", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const settings = { ...snapshot.settings, focusId: task.id, showHint: false };
  const { rerender } = render(<Pet snapshot={{ tasks: [task], settings }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByRole("button", { name: "正在做：正在整理的资料" })).toBeTruthy();
  rerender(<Pet snapshot={{ tasks: [task], settings: { ...settings, focusId: null } }} animation={null} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", { name: "正在做：正在整理的资料" })).toBeNull();
});


it("completes the current task on the pet once and retains overdue reminders during celebration", async () => {
  const base = { description: "保留任务说明", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "还没补交的周报", dueDate: "2026-11-12" };
  const current = { ...base, id: "current", title: "当前的工作", dueDate: "2026-11-14" };
  const before = { tasks: [old, current], settings: { ...snapshot.settings, focusId: current.id } };
  const next: Snapshot = { tasks: [old, { ...current, status: "completed" }], settings: { ...snapshot.settings, focusId: null } };
  let finish!: (s: Snapshot) => void;
  vi.mocked(api.save).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const onSnapshot = vi.fn();
  const { rerender } = render(<Pet snapshot={before} animation={null} onSnapshot={onSnapshot} />);
  const complete = screen.getByRole("button", { name: "完成当前任务：当前的工作" });
  fireEvent.click(complete);
  fireEvent.click(complete);
  expect((complete as HTMLButtonElement).disabled).toBe(true);
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(api.save).toHaveBeenCalledWith({ ...current, status: "completed" });
  expect(api.toggle).not.toHaveBeenCalled();
  await act(async () => finish(next));
  expect(onSnapshot).toHaveBeenCalledWith(next);
  rerender(<Pet snapshot={next} animation="celebrate" onSnapshot={onSnapshot} />);
  expect(screen.queryByRole("button", { name: "正在做：当前的工作" })).toBeNull();
  expect(screen.getByText(/逾期提醒：还没补交的周报/)).toBeTruthy();
});

it("keeps the task and overdue reminder visible when completion fails and permits retry", async () => {
  const task = { id: "current", title: "需要重试的任务", description: "", priority: "med" as const, status: "todo" as const, dueDate: "2026-11-12", dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const onSnapshot = vi.fn();
  vi.mocked(api.save).mockRejectedValueOnce(new Error("数据库暂不可用")).mockResolvedValue({ tasks: [], settings: snapshot.settings });
  render(<Pet snapshot={{ tasks: [task], settings: { ...snapshot.settings, focusId: task.id } }} animation={null} onSnapshot={onSnapshot} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "完成当前任务：需要重试的任务" })));
  expect(screen.getByRole("alert").textContent).toContain("完成失败，请重试");
  expect(screen.getByRole("button", { name: "正在做：需要重试的任务" })).toBeTruthy();
  expect(screen.getByText(/逾期提醒：需要重试的任务/)).toBeTruthy();
  expect(onSnapshot).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "完成当前任务：需要重试的任务" })));
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(api.toggle).not.toHaveBeenCalled();
});


it("hides the head card while the panel is open and restores it on close while retaining the base", () => {
  const task = { id: "current", title: "展开后继续处理", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const focused = { tasks: [task], settings: { ...snapshot.settings, focusId: task.id } };
  const { rerender } = render(<Pet snapshot={focused} animation={null} onSnapshot={() => {}} panelVisible />);
  expect(screen.queryByRole("button", { name: "正在做：展开后继续处理" })).toBeNull();
  expect(screen.queryByRole("group", { name: "桌面任务提示" })).toBeNull();
  expect(screen.getByRole("status", { name: "任务底座：待办1项，逾期0项" })).toBeTruthy();
  rerender(<Pet snapshot={focused} animation={null} onSnapshot={() => {}} panelVisible={false} />);
  expect(screen.getByRole("button", { name: "正在做：展开后继续处理" })).toBeTruthy();
  rerender(<Pet snapshot={{ ...focused, settings: snapshot.settings }} animation={null} onSnapshot={() => {}} panelVisible />);
  expect(screen.queryByRole("group", { name: "桌面任务提示" })).toBeNull();
  rerender(<Pet snapshot={{ ...focused, settings: snapshot.settings }} animation={null} onSnapshot={() => {}} panelVisible={false} />);
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
});
