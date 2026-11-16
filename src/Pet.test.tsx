import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Pet, Sprite } from "./Pet";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({ api: { toggle: vi.fn(async () => {}), save: vi.fn(), focus: vi.fn(), pause: vi.fn(), resizePet: vi.fn(async () => {}), petPosition: vi.fn(async () => ({x:0,y:0})), movePet: vi.fn(async () => {}) }, message: (e: unknown) => e instanceof Error ? e.message : String(e) }));
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
    cardPinned: true,
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
  vi.mocked(api.focus).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("opens tasks with one click", () => {
  render(<Pet snapshot={snapshot} animation={null} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "点击打开任务面板，拖动可移动精灵" }));
  expect(api.toggle).toHaveBeenCalledTimes(1);
});
it("moves the pet on drag without opening tasks", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  render(<Pet snapshot={snapshot} animation={null} onSnapshot={() => {}} />);
  const pet = screen.getByRole("button", {name:"点击打开任务面板，拖动可移动精灵"});
  pet.setPointerCapture = vi.fn();
  pet.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(pet,{button:0,screenX:100,screenY:100});
  await act(async () => {
    fireEvent.pointerMove(pet,{buttons:1,screenX:140,screenY:110});
    fireEvent.pointerUp(pet,{button:0,screenX:140,screenY:110});
  });
  fireEvent.click(pet,{detail:1});
  expect(api.movePet).toHaveBeenCalledWith({x:40,y:10});
  expect(api.toggle).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("keeps the unpinned pet compact and counts working and waiting as in progress", () => {
  const tasks = ["one", "two"].map(id => ({ id, title: id, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "", updatedAt: "", completedAt: null }));
  render(<Pet snapshot={{...snapshot, tasks, settings: {...snapshot.settings, cardPinned:false, focusId:"one"}, workflows: {one:{state:"working",steps:[]},two:{state:"waiting",steps:[]}}}} animation={null} onSnapshot={() => {}} />);
  expect(screen.queryByText("one")).toBeNull();
  expect(screen.queryByText("two")).toBeNull();
  expect(screen.queryByRole("group", {name:"当前任务卡片"})).toBeNull();
  expect(screen.getByRole("status", {name:"任务状态：待办2项，延期0项，正在做2项"})).toBeTruthy();
  expect(screen.queryByText("待跟进")).toBeNull();
});

it("cycles a task stack without opening the panel and handles task removal", () => {
  const tasks = ["写报告", "回邮件", "准备会议"].map((title, i) => ({ id: String(i), title, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/写报告/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/回邮件/)).toBeTruthy();
  expect(screen.getByText("2 / 3")).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [tasks[0]] }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/写报告/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "下一项任务" })).toBeNull();
});

it("shows an overdue task before a focused future task and marks its bubble", () => {
  const base = { description: "", status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "future", title: "明天的重点任务", priority: "high" as const, dueDate: "2026-11-14" },
    { ...base, id: "old", title: "昨天遗漏的任务", priority: "low" as const, dueDate: "2026-11-12" },
  ];
  render(<Pet snapshot={{ ...snapshot, tasks, settings: { ...snapshot.settings, focusId: "future" } }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/昨天遗漏的任务/)).toBeTruthy();
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
  expect(screen.getByText(/明天再做/)).toBeTruthy();
  vi.setSystemTime(new Date(2026, 10, 13, 12, 1));
  rerender(<Pet snapshot={{ ...snapshot, tasks }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/上午截止的任务/)).toBeTruthy();
  expect(screen.getByText(/已过截止时间/)).toBeTruthy();
});

it("does not revive a future selection when an overdue task is completed then restored", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "恢复的逾期任务", dueDate: "2026-11-12" };
  const future = { ...base, id: "future", title: "未来的任务", dueDate: "2026-11-14" };
  const { rerender } = render(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(/未来的任务/)).toBeTruthy();
  rerender(<Pet snapshot={{ ...snapshot, tasks: [{ ...old, status: "completed" }, future] }} animation={null} onSnapshot={() => {}} />);
  rerender(<Pet snapshot={{ ...snapshot, tasks: [old, future] }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText(/恢复的逾期任务/)).toBeTruthy();
});


it("uses one current card with an overdue reminder and returns to the bubble on completion", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "待补交的周报", dueDate: "2026-11-12" };
  const current = { ...base, id: "current", title: "整理明天的计划", dueDate: "2026-11-14" };
  const settings = { ...snapshot.settings, focusId: current.id };
  const { rerender } = render(<Pet snapshot={{ tasks: [old, current], settings }} animation={null} onSnapshot={() => {}} />);
  const currentTask = screen.getByRole("button", { name: "正在做：整理明天的计划" });
  expect(screen.getByText(/待补交的周报/)).toBeTruthy();
  expect(screen.getByRole("group", { name: "当前任务卡片" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "桌面任务提示" })).toBeNull();
  expect(screen.getByRole("status", { name:/^任务状态：待办2项，延期1项，正在做\d+项$/ })).toBeTruthy();
  fireEvent.click(currentTask);
  expect(api.toggle).toHaveBeenCalledTimes(1);
  rerender(<Pet snapshot={{ tasks: [old, { ...current, status: "completed" }], settings }} animation={null} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", { name: "正在做：整理明天的计划" })).toBeNull();
  expect(screen.queryByRole("group", { name: "当前任务卡片" })).toBeNull();
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  expect(screen.getByRole("status", { name:/^任务状态：待办1项，延期1项，正在做\d+项$/ })).toBeTruthy();
  expect(screen.getByText(/待补交的周报/)).toBeTruthy();
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
  expect(screen.getByText(/还没补交的周报/)).toBeTruthy();
});

it("keeps the task and overdue reminder visible when completion fails and permits retry", async () => {
  const task = { id: "current", title: "需要重试的任务", description: "", priority: "med" as const, status: "todo" as const, dueDate: "2026-11-12", dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const onSnapshot = vi.fn();
  vi.mocked(api.save).mockRejectedValueOnce(new Error("数据库暂不可用")).mockResolvedValue({ tasks: [], settings: snapshot.settings });
  render(<Pet snapshot={{ tasks: [task], settings: { ...snapshot.settings, focusId: task.id } }} animation={null} onSnapshot={onSnapshot} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "完成当前任务：需要重试的任务" })));
  expect(screen.getByRole("alert").textContent).toContain("完成失败，请重试");
  expect(screen.getByRole("button", { name: "正在做：需要重试的任务" })).toBeTruthy();
  expect(screen.getAllByText("需要重试的任务")).toHaveLength(2);
  expect(onSnapshot).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "完成当前任务：需要重试的任务" })));
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(api.toggle).not.toHaveBeenCalled();
});


it("keeps the fixed card visible independently of the task-window visibility", () => {
  const task = { id: "current", title: "展开后继续处理", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const focused = { tasks: [task], settings: { ...snapshot.settings, focusId: task.id } };
  const { rerender } = render(<Pet snapshot={focused} animation={null} onSnapshot={() => {}} panelVisible />);
  expect(screen.getByRole("button", { name: "正在做：展开后继续处理" })).toBeTruthy();
  expect(screen.queryByRole("group", { name: "桌面任务提示" })).toBeNull();
  expect(screen.getByRole("status", { name:/^任务状态：待办1项，延期0项，正在做\d+项$/ })).toBeTruthy();
  rerender(<Pet snapshot={focused} animation={null} onSnapshot={() => {}} panelVisible={false} />);
  expect(screen.getByRole("button", { name: "正在做：展开后继续处理" })).toBeTruthy();
  rerender(<Pet snapshot={{ ...focused, settings: snapshot.settings }} animation={null} onSnapshot={() => {}} panelVisible />);
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  rerender(<Pet snapshot={{ ...focused, settings: snapshot.settings }} animation={null} onSnapshot={() => {}} panelVisible={false} />);
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
});


it("completes the displayed next task without opening the panel, prevents double saves and allows retry", async () => {
  const base = { description: "完整保留的说明", priority: "high" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const one = { ...base, id: "first", title: "第一件事" };
  const two = { ...base, id: "second", title: "评估Apple个人开发者性质与企业开发者账号的差异，并整理完整申请资料和费用说明" };
  let finish!: (s: Snapshot) => void;
  vi.mocked(api.save).mockRejectedValueOnce(new Error("保存失败")).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const onSnapshot = vi.fn();
  render(<Pet snapshot={{ ...snapshot, tasks: [one, two] }} animation={null} onSnapshot={onSnapshot} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText(two.title)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `完成任务：${two.title}` })));
  expect(screen.getByRole("alert").textContent).toContain("完成失败，请重试");
  const complete = screen.getByRole("button", { name: `完成任务：${two.title}` });
  fireEvent.click(complete);
  fireEvent.click(complete);
  expect((complete as HTMLButtonElement).disabled).toBe(true);
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(api.save).toHaveBeenLastCalledWith({ ...two, status: "completed" });
  const next: Snapshot = { ...snapshot, tasks: [one, { ...two, status: "completed" }] };
  await act(async () => finish(next));
  expect(onSnapshot).toHaveBeenCalledWith(next);
  expect(api.toggle).not.toHaveBeenCalled();
});

it("keeps task text visible during interaction captions", () => {
  const task = { id: "next", title: "需要完整显示的任务标题", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  render(<Pet snapshot={{ ...snapshot, tasks: [task] }} animation="celebrate" onSnapshot={() => {}} />);
  expect(screen.getByText(task.title)).toBeTruthy();
});


it("resizes the native window when the full card grows and shrinks", async () => {
  let notify!: ResizeObserverCallback;
  let height = 340;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { notify = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height } as DOMRect));
  vi.mocked(api.resizePet).mockClear();
  try {
    render(<Pet snapshot={snapshot} animation={null} onSnapshot={() => {}} />);
    await act(async () => {});
    expect(api.resizePet).toHaveBeenLastCalledWith(340);
    height = 480;
    await act(async () => notify([], {} as ResizeObserver));
    expect(api.resizePet).toHaveBeenLastCalledWith(480);
    height = 180;
    await act(async () => notify([], {} as ResizeObserver));
    expect(api.resizePet).toHaveBeenLastCalledWith(230);
    await act(async () => notify([], {} as ResizeObserver));
    expect(api.resizePet).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});


it("renders next and overdue as separate labels rather than part of the task title", () => {
  const base = { description: "", priority: "high" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "补交上周报告", dueDate: "2026-11-12" };
  const next = { ...base, id: "next", title: "整理本周资料", dueDate: "2026-11-14" };
  render(<Pet snapshot={{ ...snapshot, tasks: [old, next] }} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText("逾期提醒").classList.contains("task-state-label")).toBe(true);
  expect(screen.getByText(old.title).classList.contains("task-bubble-title")).toBe(true);
  expect(screen.queryByText(`逾期提醒：${old.title}`)).toBeNull();
  expect(screen.getByRole("button", { name: `开始做：${old.title}` })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  expect(screen.getByText("接下来").classList.contains("task-state-label")).toBe(true);
  expect(screen.getByText(next.title).classList.contains("task-bubble-title")).toBe(true);
  expect(screen.getByRole("button", { name: `完成任务：${next.title}` })).toBeTruthy();
});

it("separates current and overdue labels when both tasks appear on the head card", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "补交上周报告", dueDate: "2026-11-12" };
  const current = { ...base, id: "now", title: "整理本周资料", dueDate: "2026-11-14" };
  render(<Pet snapshot={{tasks: [old, current],settings:{...snapshot.settings,focusId:current.id}}} animation={null} onSnapshot={() => {}} />);
  expect(screen.getByText("正在做",{selector:".task-state-label"}).classList.contains("task-state-label")).toBe(true);
  expect(screen.getByText("逾期提醒").classList.contains("task-state-label")).toBe(true);
  expect(screen.getByText(old.title)).toBeTruthy();
  expect(screen.getByText(current.title)).toBeTruthy();
  expect(screen.queryByText(`逾期提醒：${old.title}`)).toBeNull();
});


it("starts the displayed next task directly, then shows the next pending task after completing it", async () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const first = { ...base, id: "first", title: "第一项待办" };
  const chosen = { ...base, id: "chosen", title: "翻页选中的待办", createdAt: "2026-11-13T01:00:00" };
  const before: Snapshot = { ...snapshot, tasks: [first, chosen] };
  const focused: Snapshot = { ...before, settings: { ...before.settings, focusId: chosen.id } };
  let finish!: (next: Snapshot) => void;
  vi.mocked(api.focus).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const onSnapshot = vi.fn();
  const { rerender } = render(<Pet snapshot={before} animation={null} onSnapshot={onSnapshot} />);
  fireEvent.click(screen.getByRole("button", { name: "下一项任务" }));
  const start = screen.getByRole("button", { name: `开始做：${chosen.title}` });
  fireEvent.click(start);
  fireEvent.click(start);
  expect((start as HTMLButtonElement).disabled).toBe(true);
  expect(api.focus).toHaveBeenCalledExactlyOnceWith(chosen.id);
  expect((screen.getByRole("button", { name: `完成任务：${chosen.title}` }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish(focused));
  expect(onSnapshot).toHaveBeenLastCalledWith(focused);
  rerender(<Pet snapshot={focused} animation={null} onSnapshot={onSnapshot} />);
  expect(screen.getByText("正在做",{selector:".task-state-label"})).toBeTruthy();
  expect(screen.getByText(chosen.title)).toBeTruthy();
  const after: Snapshot = { ...before, tasks: [first, { ...chosen, status: "completed" }] };
  vi.mocked(api.save).mockResolvedValue(after);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `完成当前任务：${chosen.title}` })));
  expect(onSnapshot).toHaveBeenLastCalledWith(after);
  rerender(<Pet snapshot={after} animation="celebrate" onSnapshot={onSnapshot} />);
  expect(screen.getByText("接下来")).toBeTruthy();
  expect(screen.getByText(first.title)).toBeTruthy();
  expect(screen.getByRole("button", { name: `开始做：${first.title}` })).toBeTruthy();
  expect(screen.queryByText(chosen.title)).toBeNull();
  expect(api.toggle).not.toHaveBeenCalled();
});

it("keeps the next task available when starting fails and permits retry", async () => {
  const task = { id: "next", title: "需要开始的任务", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const focused: Snapshot = { ...snapshot, tasks: [task], settings: { ...snapshot.settings, focusId: task.id } };
  vi.mocked(api.focus).mockRejectedValueOnce(new Error("数据库暂不可用")).mockResolvedValue(focused);
  const onSnapshot = vi.fn();
  render(<Pet snapshot={{ ...snapshot, tasks: [task] }} animation={null} onSnapshot={onSnapshot} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `开始做：${task.title}` })));
  expect(screen.getByRole("alert").textContent).toBe("开始失败，请重试");
  expect(screen.getByText("接下来")).toBeTruthy();
  expect(onSnapshot).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `开始做：${task.title}` })));
  expect(api.focus).toHaveBeenCalledTimes(2);
  expect(onSnapshot).toHaveBeenCalledWith(focused);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(api.toggle).not.toHaveBeenCalled();
});


it.each([false,true])("starts overdue work directly and preserves its reminder until completion (current task: %s)", async (hasFocus) => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const old = { ...base, id: "old", title: "补交已逾期的方案", dueDate: "2026-11-12" };
  const next = { ...base, id: "next", title: "准备下一次会议", dueDate: "2026-11-14" };
  const before: Snapshot = { tasks: [old, next], settings: { ...snapshot.settings, focusId: hasFocus ? next.id : null } };
  const focused: Snapshot = { ...before, settings: { ...before.settings, focusId: old.id } };
  vi.mocked(api.focus).mockResolvedValue(focused);
  const onSnapshot = vi.fn();
  const { rerender } = render(<Pet snapshot={before} animation={null} onSnapshot={onSnapshot} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `开始做：${old.title}` })));
  expect(api.focus).toHaveBeenCalledExactlyOnceWith(old.id);
  expect(onSnapshot).toHaveBeenLastCalledWith(focused);
  rerender(<Pet snapshot={focused} animation={null} onSnapshot={onSnapshot} />);
  expect(screen.getByText("正在做",{selector:".task-state-label"})).toBeTruthy();
  expect(screen.getByText("逾期提醒")).toBeTruthy();
  expect(screen.getByText("已逾期1天")).toBeTruthy();
  expect(screen.getByRole("status", { name:/^任务状态：待办2项，延期1项，正在做\d+项$/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: `开始做：${old.title}` })).toBeNull();
  const after: Snapshot = { tasks: [{ ...old, status: "completed" }, next], settings: snapshot.settings };
  vi.mocked(api.save).mockResolvedValue(after);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `完成当前任务：${old.title}` })));
  rerender(<Pet snapshot={after} animation="celebrate" onSnapshot={onSnapshot} />);
  expect(screen.getByText("接下来")).toBeTruthy();
  expect(screen.getByText(next.title)).toBeTruthy();
  expect(screen.getByRole("status", { name:/^任务状态：待办1项，延期0项，正在做\d+项$/ })).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
});


it("never shows completed tasks on the desktop card even when the saved focus points to one",()=>{
  const base={description:"",priority:"high" as const,dueDate:"2026-11-12",dueTime:"17:00",createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null};
  const done={...base,id:"done",title:"已经完成的任务",status:"completed" as const,completedAt:"2026-11-13"};
  const todo={...base,id:"todo",title:"仍要处理的任务",status:"todo" as const};
  render(<Pet snapshot={{tasks:[done,todo],settings:{...snapshot.settings,focusId:done.id}}} animation={null} onSnapshot={()=>{}}/>);
  expect(screen.queryByText(done.title)).toBeNull();
  expect(screen.getByText(todo.title)).toBeTruthy();
  expect(screen.getByRole("status",{name:/^任务状态：待办1项，延期1项，正在做\d+项$/})).toBeTruthy();
});


it("rotates pending cards every ten seconds, loops, and resets the delay after manual paging",()=>{
  const tasks=["轮播任务A","轮播任务B","轮播任务C"].map((title,i)=>({id:String(i),title,description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null}));
  const {rerender}=render(<Pet snapshot={{...snapshot,tasks}} animation={null} onSnapshot={()=>{}}/>);
  act(()=>vi.advanceTimersByTime(9999));expect(screen.getByText(tasks[0].title)).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1));expect(screen.getByText(tasks[1].title)).toBeTruthy();
  // Snapshot refreshes and pet animations must not restart the rotation clock.
  act(()=>vi.advanceTimersByTime(5000));
  rerender(<Pet snapshot={{...snapshot,tasks:[...tasks]}} animation="reminder" onSnapshot={()=>{}}/>);
  act(()=>vi.advanceTimersByTime(5000));expect(screen.getByText(tasks[2].title)).toBeTruthy();
  act(()=>vi.advanceTimersByTime(10000));expect(screen.getByText(tasks[0].title)).toBeTruthy();
  act(()=>vi.advanceTimersByTime(9000));
  fireEvent.click(screen.getByRole("button",{name:"下一项任务"}));
  act(()=>vi.advanceTimersByTime(9999));expect(screen.getByText(tasks[1].title)).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1));expect(screen.getByText(tasks[2].title)).toBeTruthy();
});

it("keeps a single ongoing card stable, permits parallel overdue work, and resumes pending rotation after completion",async()=>{
  const base={description:"",priority:"med" as const,status:"todo" as const,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null};
  const current={...base,id:"now",title:"必须先完成的任务",dueDate:null};
  const old={...base,id:"old",title:"暂不能切换的逾期任务",dueDate:"2026-11-12"};
  const next={...base,id:"next",title:"等待轮播的任务",dueDate:null};
  const before={tasks:[current,old,next],settings:{...snapshot.settings,focusId:current.id}};
  const {rerender}=render(<Pet snapshot={before} animation={null} onSnapshot={()=>{}}/>);
  const start=screen.getByRole("button",{name:`开始做：${old.title}`}) as HTMLButtonElement;
  expect(start.disabled).toBe(false);expect(api.focus).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(30000));
  expect(screen.getByRole("button",{name:`正在做：${current.title}`})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"下一项任务"})).toBeNull();
  rerender(<Pet snapshot={{tasks:[{...current,status:"completed"},old,next],settings:snapshot.settings}} animation={null} onSnapshot={()=>{}}/>);
  expect(screen.getByText(old.title)).toBeTruthy();
  act(()=>vi.advanceTimersByTime(10000));expect(screen.getByText(next.title)).toBeTruthy();
});

it("pauses rotation during a start request and tolerates task removal",async()=>{
  const tasks=["等待开始A","等待开始B"].map((title,i)=>({id:String(i),title,description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null}));
  let finish!:(next:Snapshot)=>void;vi.mocked(api.focus).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const {rerender}=render(<Pet snapshot={{...snapshot,tasks}} animation={null} onSnapshot={()=>{}}/>);
  fireEvent.click(screen.getByRole("button",{name:`开始做：${tasks[0].title}`}));
  act(()=>vi.advanceTimersByTime(20000));expect(screen.getByText(tasks[0].title)).toBeTruthy();
  await act(async()=>finish({...snapshot,tasks,settings:{...snapshot.settings,focusId:tasks[0].id}}));
  rerender(<Pet snapshot={{...snapshot,tasks:[tasks[1]]}} animation={null} onSnapshot={()=>{}}/>);
  act(()=>vi.advanceTimersByTime(20000));expect(screen.getByText(tasks[1].title)).toBeTruthy();
  rerender(<Pet snapshot={snapshot} animation={null} onSnapshot={()=>{}}/>);
  act(()=>vi.advanceTimersByTime(20000));expect(screen.queryByRole("button",{name:/开始做：/})).toBeNull();
});

it("pauses directly from the current task card and shows the saved pending state", async () => {
  vi.useRealTimers();
  const task={id:"active",title:"随时可暂停",description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",startedAt:"2026-11-14T01:00:00Z",completedAt:null};
  const paused={...snapshot,tasks:[{...task,activityLog:[{id:"pause",action:"paused" as const,at:"2026-11-14T02:00:00Z"}]}]};
  vi.mocked(api.pause).mockResolvedValue(paused);
  const changed=vi.fn();
  const {rerender}=render(<Pet snapshot={{...snapshot,tasks:[task],settings:{...snapshot.settings,focusId:task.id}}} animation={null} onSnapshot={changed}/>);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:`暂停当前任务：${task.title}`})));
  expect(api.pause).toHaveBeenCalledWith(task.id);
  expect(changed).toHaveBeenCalledWith(paused);
  rerender(<Pet snapshot={paused} animation={null} onSnapshot={changed}/>);
  expect(screen.queryByRole("group",{name:"当前任务卡片"})).toBeNull();
  expect(screen.getByRole("button",{name:`继续做：${task.title}`})).toBeTruthy();
});

it("renders working and paused poses from actual task activity", () => {
  const task = {id:"state-task", title:"状态任务", description:"", priority:"med" as const, status:"todo" as const, dueDate:null, dueTime:null, createdAt:"2026-11-13", updatedAt:"2026-11-13", completedAt:null, activityLog:[{id:"a",action:"paused" as const,at:"2026-11-13T10:00:00Z"}]};
  const {container,rerender} = render(<Pet snapshot={{...snapshot,tasks:[task],settings:{...snapshot.settings,focusId:task.id}}} animation={null} onSnapshot={() => {}} />);
  expect(container.querySelector(".sprite")?.getAttribute("data-state")).toBe("working");
  rerender(<Pet snapshot={{...snapshot,tasks:[task]}} animation={null} onSnapshot={() => {}} />);
  expect(container.querySelector(".sprite")?.getAttribute("data-state")).toBe("rest");
});
it("keeps a premium preference but renders its free fallback until renewal", () => {
  const selected = {...snapshot,settings:{...snapshot.settings,pet:"snow-shiba" as const}};
  const {container,rerender} = render(<Pet snapshot={selected} animation={null} onSnapshot={() => {}} />);
  expect(container.querySelector(".sprite")?.getAttribute("data-pet")).toBe("shiba");
  rerender(<Pet snapshot={{...selected,looksExpiresAt:"2099-01-01T00:00:00Z"}} animation={null} onSnapshot={() => {}} />);
  expect(container.querySelector(".sprite")?.getAttribute("data-pet")).toBe("snow-shiba");
});
it.each(["fox", "panda"] as const)("renders %s with the same pixel sheet and six state hooks as the original companions", pet => {
  const frames = new Set();
  for (const state of ["idle", "working", "rest", "reminder", "celebrate", "interaction"] as const) {
    const {container, unmount} = render(<Sprite pet={pet} state={state} />);
    const sprite = container.querySelector(".sprite") as HTMLElement;
    expect(sprite.style.backgroundImage).toContain(`/pets/${pet}.png`);
    expect(sprite.getAttribute("data-state")).toBe(state);
    expect(sprite.classList.contains("vector-sprite")).toBe(false);
    expect(sprite.querySelector(".character-body")).toBeNull();
    frames.add(sprite.style.backgroundPositionX);
    unmount();
  }
  expect(frames.size).toBe(4);
});
it.each(["mint-ghost","sunset-robot","snow-shiba","cream-cat"] as const)("keeps %s animated across all six states using the base pixel sheet", pet => {
  const poses = new Set();
  const states = new Set();
  for (const state of ["idle","working","rest","reminder","celebrate","interaction"] as const) {
    const {container,unmount} = render(<Sprite pet={pet} state={state} />);
    const sprite = container.querySelector(".sprite") as HTMLElement;
    expect(sprite.style.backgroundImage).toMatch(/pets\/(ghost|robot|shiba|cat)\.png/);
    expect(sprite.style.filter).toBeTruthy();
    poses.add(sprite.style.backgroundPositionX);
    states.add(sprite.getAttribute("data-state"));
    unmount();
  }
  expect(poses.size).toBe(4);
  expect(states.size).toBe(6);
});
it("keeps quiet hours in a static rest pose despite completion events and clicks", () => {
  const quiet = {...snapshot,settings:{...snapshot.settings,pet:"fox" as const,quietStart:"00:00",quietEnd:"23:59"},looksExpiresAt:"2099-01-01T00:00:00Z"};
  const {container} = render(<Pet snapshot={quiet} animation="celebrate" onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"点击打开任务面板，拖动可移动精灵"}));
  const sprite = container.querySelector(".sprite")!;
  expect(sprite.getAttribute("data-state")).toBe("rest");
  expect(sprite.classList.contains("still")).toBe(true);
});

it.each(["cat","shiba","robot","ghost","mint-ghost","sunset-robot","snow-shiba","cream-cat","fox","panda"] as const)("keeps %s unobstructed while working without a desk or keyboard overlay", pet => {
  const {container} = render(<Sprite pet={pet} state="working" />);
  const sprite = container.querySelector(".sprite")!;
  expect(sprite.querySelector(".pose-prop")).toBeNull();

});

it('cycles every ongoing task including waiting and labels waiting separately',()=>{
 const tasks=['执行甲','执行乙','等待回复','未开始'].map((title,i)=>({id:String(i),title,description:'',priority:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-13',updatedAt:'2026-11-13',completedAt:null}));
 const current:Snapshot={...snapshot,tasks,settings:{...snapshot.settings,focusId:'0'},workflows:{'0':{state:'working',steps:[]},'1':{state:'working',steps:[]},'2':{state:'waiting',steps:[]},'3':{state:'idle',steps:[]}}};
 const {rerender}=render(<Pet snapshot={current} animation={null} onSnapshot={()=>{}}/>);
 expect(screen.getByRole('button',{name:'正在做：执行甲'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'下一项进行中任务'}));
 expect(screen.getByRole('button',{name:'正在做：执行乙'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'下一项进行中任务'}));
 expect(screen.getByRole('button',{name:'等待进展：等待回复'})).toBeTruthy();
 expect(screen.getByText('等待进展')).toBeTruthy();
 expect(screen.getByText('3 / 3')).toBeTruthy();
 expect(screen.queryByText('未开始')).toBeNull();
 expect(api.focus).not.toHaveBeenCalled();
 expect(screen.getByRole('status',{name:'任务状态：待办4项，延期0项，正在做3项'})).toBeTruthy();
 rerender(<Pet snapshot={{...current,tasks:tasks.map(t=>t.id==='2'?{...t,status:'completed'}:t)}} animation={null} onSnapshot={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'等待进展：等待回复'})).toBeNull();
 expect(screen.getByText('1 / 2')).toBeTruthy();
});
it('rotates ongoing cards and supports wheel navigation without changing task execution',()=>{
 const tasks=['甲','乙'].map((title,i)=>({id:String(i),title,description:'',priority:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-13',updatedAt:'2026-11-13',completedAt:null}));
 render(<Pet snapshot={{...snapshot,tasks,settings:{...snapshot.settings,focusId:'0'},workflows:{'0':{state:'working',steps:[]},'1':{state:'waiting',steps:[]}}}} animation={null} onSnapshot={()=>{}}/>);
 act(()=>vi.advanceTimersByTime(10000));
 expect(screen.getByRole('button',{name:'等待进展：乙'})).toBeTruthy();
 fireEvent.wheel(screen.getByRole('group',{name:'当前任务卡片'}),{deltaY:40});
 expect(screen.getByRole('button',{name:'正在做：甲'})).toBeTruthy();
 expect(api.focus).not.toHaveBeenCalled();
});
it('resumes a waiting task without removing other ongoing tasks from the card list',async()=>{
 const tasks=['工作','等回复'].map((title,i)=>({id:String(i),title,description:'',priority:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-13',updatedAt:'2026-11-13',completedAt:null}));
 const before:Snapshot={...snapshot,tasks,settings:{...snapshot.settings,focusId:'1'},workflows:{'0':{state:'working',steps:[]},'1':{state:'waiting',steps:[]}}};
 const after:Snapshot={...before,workflows:{'0':{state:'working',steps:[]},'1':{state:'working',steps:[]}}};
 vi.mocked(api.focus).mockResolvedValue(after);const changed=vi.fn();
 const {rerender}=render(<Pet snapshot={before} animation={null} onSnapshot={changed}/>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'继续做当前任务：等回复'})));
 expect(api.focus).toHaveBeenCalledWith('1');expect(changed).toHaveBeenCalledWith(after);
 rerender(<Pet snapshot={after} animation={null} onSnapshot={changed}/>);
 expect(screen.getByRole('button',{name:'正在做：等回复'})).toBeTruthy();
 expect(screen.getByText('2 / 2')).toBeTruthy();
});

it('pins the pet card independently of task-window pinning and visibility',()=>{
 const task={id:'separate',title:'独立固定的小卡片',description:'',priority:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-13',updatedAt:'2026-11-13',completedAt:null};
 const {rerender}=render(<Pet snapshot={{...snapshot,tasks:[task],settings:{...snapshot.settings,cardPinned:true,panelPinned:false,focusId:task.id}}} animation={null} onSnapshot={()=>{}} panelVisible/>);
 expect(screen.getByRole('button',{name:'正在做：独立固定的小卡片'})).toBeTruthy();
 rerender(<Pet snapshot={{...snapshot,tasks:[task],settings:{...snapshot.settings,cardPinned:false,panelPinned:true,focusId:task.id}}} animation={null} onSnapshot={()=>{}} panelVisible={false}/>);
 expect(screen.queryByRole('group',{name:'当前任务卡片'})).toBeNull();
});
