import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
import { TaskPanel } from "./TaskPanel";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({
  api: { save: vi.fn(), preview: vi.fn() },
  message: (e: unknown) => String(e),
}));
const snapshot: Snapshot = {
  tasks: [],
  settings: {
    pet: "shiba",
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
it("closes a committed new task without risking a duplicate from a failed refresh", async () => {
  vi.mocked(api.save).mockResolvedValue({
    ...snapshot,
    tasks: [
      {
        id: "persisted",
        title: "已保存",
        description: "",
        priority: "med",
        status: "todo",
        dueDate: null,
        dueTime: null,
        createdAt: "2026-11-13",
        updatedAt: "2026-11-13",
        completedAt: null,
      },
    ],
  });
  const onSnapshot = vi.fn();
  const refresh = vi.fn(async () => {
    throw new Error("display refresh unavailable");
  });
  render(<TaskPanel {...{ snapshot, refresh, onSnapshot }} />);
  fireEvent.click(screen.getByRole("button", { name: "记下第一件事" }));
  fireEvent.change(screen.getByLabelText("任务内容"), {
    target: { value: "已保存" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() => expect(screen.queryByLabelText("任务内容")).toBeNull());
  expect(onSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "persisted" }),
      ]),
    }),
  );
  cleanup();
});

it("previews a celebration while keeping the unsaved task text", async () => {
  vi.mocked(api.preview).mockResolvedValue();
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "记下第一件事" }));
  fireEvent.change(screen.getByLabelText("任务内容"), {
    target: { value: "还没保存的内容" },
  });
  fireEvent.click(screen.getByRole("button", { name: "试试动作" }));
  fireEvent.click(screen.getByRole("button", { name: "预览庆祝" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("正在演示庆祝"),
  );
  expect((screen.getByLabelText("任务内容") as HTMLTextAreaElement).value).toBe(
    "还没保存的内容",
  );
  cleanup();
});

it("pages three tasks at a time with overdue tasks before future tasks", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "a", title: "昨天到期", dueDate: "2026-11-12" },
    { ...base, id: "b", title: "明天的事", dueDate: "2026-11-14" },
    { ...base, id: "c", title: "稍远的事", dueDate: "2026-11-15" },
    { ...base, id: "d", title: "第四件事", dueDate: "2026-11-16" },
  ];
  const { rerender } = render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(3);
  expect(screen.getByRole("button", { name: "昨天到期" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "第四件事" })).toBeNull();
  expect((screen.getByRole("button", { name: "上一页任务" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "第四件事" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "下一页任务" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<TaskPanel snapshot={{ ...snapshot, tasks: [tasks[0]] }} onSnapshot={() => {}} />);
  expect(screen.getByRole("button", { name: "昨天到期" })).toBeTruthy();
});

it("returns to the first page after switching to completed and back", () => {
  const tasks = [0,1,2,3].map(i => ({ id: String(i), title: `分页任务${i}`, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  fireEvent.click(screen.getByRole("button", { name: "已完成 0" }));
  fireEvent.click(screen.getByRole("button", { name: "待办 4" }));
  expect(screen.getByRole("button", { name: "分页任务0" })).toBeTruthy();
});
it("reduces the page size when the available task area cannot fit three rows", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-page") ? 136 : 0; });
  vi.stubGlobal("ResizeObserver", class { constructor(private changed: () => void) {} observe() { this.changed(); } disconnect() {} });
  const tasks = [0,1,2,3].map(i => ({ id: String(i), title: `紧凑任务${i}`, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  expect(screen.getByRole("button", { name: "紧凑任务2" })).toBeTruthy();
});
