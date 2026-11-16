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

it("keeps Save available in the date sheet and restores an unsaved draft on cancellation", () => {
  render(<TaskEditor onSave={async () => {}} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("任务内容"), { target: { value: "不能丢失这段话" } });
  fireEvent.click(screen.getByRole("radio", { name: "高优先级" }));
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "保存任务" }).closest(".editor-save-bar")).toBeTruthy();
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

const chainTask = {id:"chain",title:"整理报告",description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-14T00:00:00Z",updatedAt:"2026-11-14T02:00:00Z",completedAt:null};
it("appends timestamped steps without replacing previous content", async () => {
  const append = vi.fn(async () => {});
  render(<TaskEditor task={chainTask} workflow={{state:"working",steps:[{id:"step1",content:"收到初稿",createdAt:"2026-11-14T01:00:00Z"}]}} onAppendStep={append} onSave={vi.fn()} onClose={vi.fn()}/>);
  const chain=screen.getByLabelText("跟进记录");
  expect(chain.textContent).toContain("收到初稿");
  expect(chain.querySelector("time")?.dateTime).toBe("2026-11-14T01:00:00Z");
  fireEvent.click(screen.getByRole("button",{name:"记录进展"}));
  fireEvent.change(screen.getByLabelText("本次进展"),{target:{value:"  补齐数据  "}});
  fireEvent.click(screen.getByRole("button",{name:"记录进展"}));
  await waitFor(()=>expect(screen.queryByLabelText("本次进展")).toBeNull());
  expect(append).toHaveBeenCalledWith("补齐数据");
  expect(chain.textContent).toContain("收到初稿");
});
it("keeps a failed step draft and prevents duplicate append while waiting", async () => {
  let reject!: (error: Error) => void;
  const append = vi.fn(()=>new Promise<void>((_,fail)=>{reject=fail;}));
  render(<TaskEditor task={chainTask} workflow={{state:"waiting",steps:[]}} onAppendStep={append} onSave={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"记录进展"}));
  fireEvent.change(screen.getByLabelText("本次进展"),{target:{value:"等待确认"}});
  fireEvent.click(screen.getByRole("button",{name:"记录进展"}));
  expect((screen.getByLabelText("本次进展") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"正在记录…"}) as HTMLButtonElement).disabled).toBe(true);
  reject(new Error("追加失败"));
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("追加失败"));
  expect((screen.getByLabelText("本次进展") as HTMLTextAreaElement).value).toBe("等待确认");
});
it("keeps completed chains readable without an append field", () => {
  render(<TaskEditor task={{...chainTask,status:"completed"}} workflow={{state:"idle",steps:[{id:"step1",content:"已交付报告",createdAt:"2026-11-14T01:00:00Z"}]}} onAppendStep={vi.fn()} onSave={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByLabelText("跟进记录").textContent).toContain("已交付报告");
  expect(screen.queryByLabelText("本次进展")).toBeNull();
});
it("keeps Save outside scrollable long content and expanded history", () => {
  render(<TaskEditor task={{...chainTask,description:"详细说明\n".repeat(500)}} onSave={vi.fn()} onClose={vi.fn()}/>);
  const save=screen.getByRole("button",{name:"保存任务"});
  expect(save.closest(".editor-save-bar")).toBeTruthy();
  expect(save.closest(".editor-scroll")).toBeNull();
  expect(screen.getByLabelText("任务内容").closest(".editor-scroll")).toBeTruthy();
});
it("saves the chosen period from the date sheet without a second day click", async () => {
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date(2026,10,16,9));
  const save=vi.fn(async()=>{});
  render(<TaskEditor onSave={save} onClose={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("任务内容"),{target:{value:"安排报告"}});
  fireEvent.click(screen.getByRole("button",{name:"选择截止时间"}));
  fireEvent.click(screen.getByRole("button",{name:"上午 12:00 截止"}));
  fireEvent.click(screen.getByRole("button",{name:"保存任务"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({dueDate:"2026-11-16",dueTime:"12:00"})));
});

it('places a visible add-step button before timing details',()=>{
 const {container}=render(<TaskEditor task={chainTask} workflow={{state:'working',steps:[]}} onAppendStep={vi.fn()} onSave={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'记录进展'}));
 const add=screen.getByRole('button',{name:'记录进展'});
 expect(add.classList.contains('primary')).toBe(true);
 expect(add.compareDocumentPosition(screen.getByLabelText('任务时间记录')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(container.querySelector('.editor-save-bar')).toBeTruthy();
});

it('deletes only the selected follow-up record and retains the others', async()=>{
 const steps=[{id:'first',content:'收到初稿',createdAt:'2026-11-14T01:00:00Z'},{id:'second',content:'等待反馈',createdAt:'2026-11-14T02:00:00Z'}];
 const remove=vi.fn(async()=>{});
 const props={task:chainTask,onSave:vi.fn(),onClose:vi.fn(),onDeleteStep:remove};
 const {rerender}=render(<TaskEditor {...props} workflow={{state:'waiting',steps}}/>);
 fireEvent.click(screen.getByRole('button',{name:'删除跟进记录 1'}));
 await waitFor(()=>expect(remove).toHaveBeenCalledWith('first'));
 rerender(<TaskEditor {...props} workflow={{state:'waiting',steps:[steps[1]]}}/>);
 expect(screen.queryByText('收到初稿')).toBeNull();
 expect(screen.getByText('等待反馈')).toBeTruthy();
 expect(screen.getByRole('heading',{name:'跟进记录 · 1条'})).toBeTruthy();
});
it('keeps a completed task record visible when deleting fails',async()=>{
 const remove=vi.fn(async()=>{throw new Error('删除失败');});
 render(<TaskEditor task={{...chainTask,status:'completed'}} workflow={{state:'idle',steps:[{id:'first',content:'已交付报告',createdAt:'2026-11-14T01:00:00Z'}]}} onDeleteStep={remove} onSave={vi.fn()} onClose={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'删除跟进记录 1'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('删除失败'));
 expect(screen.getByText('已交付报告')).toBeTruthy();
});

it('starts the progress composer collapsed and preserves its draft when toggled',()=>{
 render(<TaskEditor task={chainTask} workflow={{state:'working',steps:[]}} onAppendStep={vi.fn()} onSave={vi.fn()} onClose={vi.fn()}/>);
 expect(screen.queryByLabelText('本次进展')).toBeNull();
 const toggle=screen.getByRole('button',{name:'记录进展'});
 expect(toggle.getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(toggle);
 fireEvent.change(screen.getByLabelText('本次进展'),{target:{value:'下次继续补充'}});
 fireEvent.click(screen.getByRole('button',{name:'收起输入'}));
 expect(screen.queryByLabelText('本次进展')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'记录进展'}));
 expect((screen.getByLabelText('本次进展') as HTMLTextAreaElement).value).toBe('下次继续补充');
});
it('opens the composer when explicitly entering from the task card progress button',()=>{
 render(<TaskEditor task={chainTask} focusChain workflow={{state:'working',steps:[]}} onAppendStep={vi.fn()} onSave={vi.fn()} onClose={vi.fn()}/>);
 expect(screen.getByLabelText('本次进展')).toBeTruthy();
});
