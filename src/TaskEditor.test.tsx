import { it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { TaskEditor } from "./TaskEditor";
it("keeps the user draft visible when saving fails", async () => {
  render(
    <TaskEditor
      onSave={async () => {
        throw new Error("磁盘写入失败");
      }}
      onClose={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("任务内容"), {
    target: { value: "保留这份草稿" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("磁盘写入失败"),
  );
  expect((screen.getByLabelText("任务内容") as HTMLInputElement).value).toBe(
    "保留这份草稿",
  );
  cleanup();
});

it("saves one text field with direct priority selection and a deadline", async () => {
  const onSave = vi.fn(async () => {});
  render(<TaskEditor onSave={onSave} onClose={() => {}} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("任务内容"), {
    target: { value: "整理今天的会议记录\n补齐结论和下一步安排" },
  });
  const today = new Date();
  const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;
  fireEvent.click(screen.getByRole("button", { name: "选择截止日期" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: `${today.getFullYear()}年${today.getMonth() + 1}月15日`,
    }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "高优先级" }));
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "整理今天的会议记录",
        description: "整理今天的会议记录\n补齐结论和下一步安排",
        priority: "high",
        dueDate: expectedDate,
      }),
    ),
  );
  cleanup();
});
it("retains existing title and description in one editable text field", () => {
  render(
    <TaskEditor
      task={{
        id: "legacy",
        title: "原来的标题",
        description: "原来的补充说明",
        priority: "med",
        status: "todo",
        dueDate: null,
        createdAt: "2026-11-13",
        updatedAt: "2026-11-13",
        completedAt: null,
      }}
      onSave={async () => {}}
      onClose={() => {}}
    />,
  );
  expect((screen.getByLabelText("任务内容") as HTMLTextAreaElement).value).toBe(
    "原来的标题\n\n原来的补充说明",
  );
  cleanup();
});
