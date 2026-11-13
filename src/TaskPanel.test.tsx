import { it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { TaskPanel } from "./TaskPanel";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({
  api: { save: vi.fn() },
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
  fireEvent.click(screen.getByRole("button", { name: "记下第一件事 ＋" }));
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "已保存" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() => expect(screen.queryByLabelText("任务名称")).toBeNull());
  expect(onSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "persisted" }),
      ]),
    }),
  );
  cleanup();
});
