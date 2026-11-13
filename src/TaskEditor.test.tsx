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
  fireEvent.change(screen.getByLabelText("任务名称"), {
    target: { value: "保留这份草稿" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("磁盘写入失败"),
  );
  expect((screen.getByLabelText("任务名称") as HTMLInputElement).value).toBe(
    "保留这份草稿",
  );
  cleanup();
});
