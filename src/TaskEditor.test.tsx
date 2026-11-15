import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { TaskEditor } from "./TaskEditor";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 16, 9));
  const onSave = vi.fn(async () => {});
  render(<TaskEditor onSave={onSave} onClose={() => {}} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("任务内容"), {
    target: { value: "整理今天的会议记录\n补齐结论和下一步安排" },
  });
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  fireEvent.click(screen.getByRole("button", { name: "2026年11月17日" }));
  fireEvent.click(screen.getByRole("button", { name: "下午 17:00 截止" }));
  fireEvent.click(screen.getByRole("radio", { name: "高优先级" }));
  fireEvent.click(screen.getByRole("button", { name: "保存任务" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "整理今天的会议记录",
        description: "整理今天的会议记录\n补齐结论和下一步安排",
        priority: "high",
        dueDate: "2026-11-17",
        dueTime: "17:00",
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
        dueTime: null,
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

it("replaces the form while choosing time and restores an unsaved draft on cancellation", () => {
  render(<TaskEditor onSave={async () => {}} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("任务内容"), { target: { value: "不能丢失这段话" } });
  fireEvent.click(screen.getByRole("radio", { name: "高优先级" }));
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "保存任务" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "返回任务编辑" }));
  expect((screen.getByLabelText("任务内容") as HTMLTextAreaElement).value).toBe("不能丢失这段话");
  expect(screen.getByRole("radio", { name: "高优先级" }).getAttribute("aria-checked")).toBe("true");
});

it("fits the loaded task text and shrinks again after shortening it", () => {
  let contentHeight = 164;
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => contentHeight);
  render(<TaskEditor task={{ id: "long", title: "完整任务", description: "这是一段需要完整展示的补充说明。", priority: "med", status: "todo", dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }} onSave={async () => {}} onClose={() => {}} />);
  const input = screen.getByLabelText("任务内容") as HTMLTextAreaElement;
  expect(parseFloat(input.style.height)).toBeGreaterThanOrEqual(164);
  contentHeight = 81;
  fireEvent.change(input, { target: { value: "一件小事" } });
  expect(parseFloat(input.style.height)).toBeLessThan(100);
  contentHeight = 164;
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  fireEvent.click(screen.getByRole("button", { name: "返回任务编辑" }));
  expect(parseFloat((screen.getByLabelText("任务内容") as HTMLTextAreaElement).style.height)).toBeGreaterThanOrEqual(164);
});

it("shows recorded start, completion and fixed elapsed time without editing them", () => {
  render(<TaskEditor task={{ id: "timed", title: "计时任务", description: "", priority: "med", status: "completed", dueDate: null, dueTime: null, createdAt: "2026-11-13T00:00:00Z", updatedAt: "2026-11-13T02:02:03Z", startedAt: "2026-11-13T01:00:00Z", completedAt: "2026-11-13T02:02:03Z" }} onSave={vi.fn()} onClose={vi.fn()} />);
  const timing = screen.getByLabelText("任务时间记录");
  expect(timing.textContent).toContain("开始时间");
  expect(timing.textContent).toContain("完成时间");
  expect(timing.textContent).toContain("1小时2分");
});
it('keeps the content behind a deadline bottom sheet and persists the work or life label',async()=>{
 const save=vi.fn(async()=>{});render(<TaskEditor onSave={save} onClose={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('任务内容'),{target:{value:'shopping'}});
 fireEvent.click(screen.getByRole('radio',{name:'生活标签'}));
 fireEvent.click(screen.getByRole('button',{name:'选择截止时间'}));
 expect(screen.getByRole('dialog',{name:'选择截止时间'})).toBeTruthy();
 expect((screen.getByLabelText('任务内容') as HTMLTextAreaElement).value).toBe('shopping');
 fireEvent.click(screen.getByRole('button',{name:'返回任务编辑'}));
 fireEvent.click(screen.getByRole('button',{name:'保存任务'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({category:'life',title:'shopping'})));
});

it("shows every saved state transition in expandable history", () => {
  const task={id:"history",title:"保留历史",description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-14T00:00:00Z",updatedAt:"2026-11-14T02:00:00Z",startedAt:"2026-11-14T01:00:00Z",completedAt:null,activityLog:[{id:"1",action:"started" as const,at:"2026-11-14T01:00:00Z"},{id:"2",action:"paused" as const,at:"2026-11-14T01:10:00Z"}]};
  render(<TaskEditor task={task} onSave={vi.fn()} onClose={vi.fn()}/>);
  const history=screen.getByLabelText("任务状态记录");
  expect(history.querySelectorAll("li")).toHaveLength(2);
  expect(history.textContent).toContain("开始做");
  expect(history.textContent).toContain("暂停");
  expect(screen.getByLabelText("任务时间记录").textContent).toContain("10分");
});
