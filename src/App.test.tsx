import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { api } from "./api";
import type { Snapshot } from "./types";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (event: { payload: unknown }) => void>() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name, handler) => { handlers.set(name, handler); return () => handlers.delete(name); }) }));
vi.mock("./api", () => ({ api: { snapshot: vi.fn(), panelVisible: vi.fn(), panelInteraction: vi.fn(async () => {}) }, message: (e: unknown) => String(e) }));
const snapshot: Snapshot = { tasks: [], settings: { pet: "ghost", theme: "light", focusId: null, notifications: true, summaryTime: "09:00", quietStart: "23:00", quietEnd: "08:00", reduceMotion: true, showHint: true, cardPinned: true, petX: null, petY: null } };
afterEach(() => { cleanup(); handlers.clear(); vi.resetAllMocks(); window.history.replaceState({}, "", "/"); });
it("keeps a fixed pet card visible when the task window opens or closes", async () => {
  window.history.replaceState({}, "", "/?view=pet");
  vi.mocked(api.snapshot).mockResolvedValue(snapshot);
  vi.mocked(api.panelVisible).mockResolvedValue(true);
  render(<App />);
  await waitFor(() => expect(api.panelVisible).toHaveBeenCalled());
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  expect(screen.getByRole("status", { name: "任务状态：待办0项，延期0项，正在做0项" })).toBeTruthy();
  act(() => handlers.get("panel-visibility")!({ payload: false }));
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  act(() => handlers.get("panel-visibility")!({ payload: true }));
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
});
it("keeps a fixed card independent of a delayed task-window visibility query", async () => {
  window.history.replaceState({}, "", "/?view=pet");
  vi.mocked(api.snapshot).mockResolvedValue(snapshot);
  let resolve!: (visible: boolean) => void;
  vi.mocked(api.panelVisible).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<App />);
  await waitFor(() => expect(api.panelVisible).toHaveBeenCalled());
  act(() => handlers.get("panel-visibility")!({ payload: true }));
  await act(async () => resolve(false));
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
  act(() => handlers.get("panel-visibility")!({ payload: false }));
  expect(screen.getByRole("group", { name: "桌面任务提示" })).toBeTruthy();
});

it("clears a delivered reminder when the task deadline changes", async () => {
  window.history.replaceState({}, "", "/?view=pet");
  const task: Snapshot["tasks"][number] = {
    id: "deadline-task", title: "确认新截止时间", description: "", priority: "med", status: "todo",
    dueDate: "2099-12-01", dueTime: "12:00", createdAt: "2099-11-30T00:00:00Z", updatedAt: "2099-11-30T00:00:00Z",
    startedAt: null, completedAt: null,
  };
  vi.mocked(api.snapshot).mockResolvedValue({ ...snapshot, tasks: [task] });
  vi.mocked(api.panelVisible).mockResolvedValue(false);
  render(<App />);
  await waitFor(() => expect(api.panelVisible).toHaveBeenCalled());
  act(() => handlers.get("reminder-tasks")!({ payload: [task.id] }));
  expect(screen.getByText(/到期提醒/)).toBeTruthy();
  act(() => handlers.get("snapshot")!({ payload: { ...snapshot, tasks: [{ ...task, dueTime: "17:00" }] } }));
  expect(screen.queryByText(/到期提醒/)).toBeNull();
});
