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
  api: { preferences: vi.fn(), save: vi.fn(), preview: vi.fn(), execution: vi.fn(), appendStep: vi.fn(), panelInteraction: vi.fn(async () => {}), resizePanel:vi.fn(async()=>740), deleteTask: vi.fn(), pause: vi.fn(), focus: vi.fn(), exportTasks: vi.fn(), quit: vi.fn(), openWebsite: vi.fn(), syncStatus: vi.fn(async () => ({bound:false, accountId:null, enabled:false, pending:0, conflicts:[], license:null})) },
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

it("keeps action previews in settings and hides them while editing a task", async () => {
  vi.mocked(api.preview).mockResolvedValue();
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", { name: "试试动作" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "试试动作" }));
  fireEvent.click(screen.getByRole("button", { name: "预览庆祝" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("正在演示庆祝"),
  );
  fireEvent.click(screen.getByRole("button", { name: "返回" }));
  fireEvent.click(screen.getByRole("button", { name: "记下第一件事" }));
  expect(screen.queryByRole("button", { name: "试试动作" })).toBeNull();
  expect(screen.queryByRole("button", { name: "预览庆祝" })).toBeNull();
  cleanup();
});

it("pages six tasks at a time with overdue tasks before future tasks", () => {
  const base = { description: "", priority: "med" as const, status: "todo" as const, dueTime: "17:00", createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  const tasks = [
    { ...base, id: "a", title: "昨天到期", dueDate: "2026-11-12" },
    { ...base, id: "b", title: "明天的事", dueDate: "2026-11-14" },
    { ...base, id: "c", title: "稍远的事", dueDate: "2026-11-15" },
    ...[3,4,5,6].map(i => ({...base,id:String(i),title:`第${i+1}件事`,dueDate:`2026-11-${String(i+13).padStart(2,"0")}`})),
  ];
  const { rerender } = render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(6);
  expect(screen.getByRole("button", { name: "昨天到期" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "第7件事" })).toBeNull();
  expect((screen.getByRole("button", { name: "上一页任务" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "第7件事" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "下一页任务" }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<TaskPanel snapshot={{ ...snapshot, tasks: [tasks[0]] }} onSnapshot={() => {}} />);
  expect(screen.getByRole("button", { name: "昨天到期" })).toBeTruthy();
});

it("returns to the first page after switching to completed and back", () => {
  const tasks = [0,1,2,3,4,5,6].map(i => ({ id: String(i), title: `分页任务${i}`, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  fireEvent.click(screen.getByRole("button", { name: "已完成 0" }));
  fireEvent.click(screen.getByRole("button", { name: "待办 7" }));
  expect(screen.getByRole("button", { name: "分页任务0" })).toBeTruthy();
});
it("reduces the page size when the available task area cannot fit three rows", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-list-area") ? 136 : 0; });
  vi.stubGlobal("ResizeObserver", class { constructor(private changed: () => void) {} observe() { this.changed(); } disconnect() {} });
  const tasks = [0,1,2,3].map(i => ({ id: String(i), title: `紧凑任务${i}`, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "下一页任务" }));
  expect(screen.getByRole("button", { name: "紧凑任务1" })).toBeTruthy();
});

it("reserves pagination height before fitting task cards", () => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-list-area") || this.classList.contains("task-page") ? 168 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-pager") ? 40 : 0; });
  vi.stubGlobal("ResizeObserver", class { constructor(private changed: () => void) {} observe() { this.changed(); } disconnect() {} });
  const tasks = [0,1,2].map(i => ({ id: String(i), title: `空间测试${i}`, description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null }));
  render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={() => {}} />);
  expect(screen.getAllByRole("button", { name: /^完成 / })).toHaveLength(1);
  expect(screen.getByText("1 / 3")).toBeTruthy();
});


for (const status of ["todo", "completed"] as const) it(`directly deletes a ${status} task without a recovery view`, async () => {
  const task = { id: "remove", title: "直接删除的任务", description: "", priority: "med" as const, status, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: status === "completed" ? "2026-11-13" : null };
  vi.mocked(api.deleteTask).mockResolvedValue(snapshot);
  const changed = vi.fn();
  const { rerender } = render(<TaskPanel snapshot={{ ...snapshot, tasks: [task] }} onSnapshot={changed} />);
  if (status === "completed") fireEvent.click(screen.getByRole("button", { name: "已完成 1" }));
  fireEvent.click(screen.getByRole("button", { name: "删除任务 直接删除的任务" }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(snapshot));
  expect(api.deleteTask).toHaveBeenCalledWith(task.id);
  rerender(<TaskPanel snapshot={snapshot} onSnapshot={changed} />);
  expect(screen.queryByRole("button", { name: task.title })).toBeNull();
  expect(screen.queryByRole("button", { name: /最近删除/ })).toBeNull();
});
it("keeps a task visible and shows an error if deleting fails", async () => {
  const task = { id: "failure", title: "暂时无法删除", description: "", priority: "med" as const, status: "todo" as const, dueDate: null, dueTime: null, createdAt: "2026-11-13", updatedAt: "2026-11-13", completedAt: null };
  vi.mocked(api.deleteTask).mockRejectedValue(new Error("删除失败"));
  const changed = vi.fn();
  render(<TaskPanel snapshot={{ ...snapshot, tasks: [task] }} onSnapshot={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "删除任务 暂时无法删除" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("删除失败"));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: task.title })).toBeTruthy();
});

it("opens the wardrobe from settings and returns through settings to the task list", () => {
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"设置"}));
  fireEvent.click(screen.getByRole("button", {name:"更多装扮"}));
  expect(screen.getByRole("heading", {name:"精灵衣橱"})).toBeTruthy();
  expect(screen.queryByRole("button", {name:"试试动作"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"返回设置"}));
  expect(screen.getByRole("heading",{name:"设置"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name:"返回"}));
  expect(screen.getByRole("button", {name:"记下第一件事"})).toBeTruthy();
});

it("keeps the free task panel and settings free of payment entries", () => {
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", {name:"年卡与云服务"})).toBeNull();
  expect(screen.queryByText(/年卡|购买|付费|扩容/)).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"设置"}));
  expect(screen.queryByText(/年卡|购买|付费|扩容/)).toBeNull();
});


it("shows only the latest 15 completions with export available only from settings", async () => {
  const tasks = Array.from({length:20}, (_,i) => ({id:String(i),title:`历史任务${i}`,description:"",priority:"med" as const,status:"completed" as const,dueDate:null,dueTime:null,createdAt:"2026-11-01",updatedAt:"2026-11-21",completedAt:`2026-11-${String(i+1).padStart(2,"0")}T12:00:00Z`}));
  vi.mocked(api.exportTasks).mockReset().mockResolvedValue("/tmp/all-tasks.csv");
  render(<TaskPanel snapshot={{...snapshot,tasks}} onSnapshot={()=>{}}/>);
  expect(screen.queryByRole("button",{name:/^恢复 /})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"已完成 20"}));
  expect(screen.getByText(/仅展示最近15条/)).toBeTruthy();
  const shown:string[]=[];
  for(let page=0;page<3;page++){
    shown.push(...screen.getAllByRole("button",{name:/^恢复 /}).map(button=>button.getAttribute("aria-label")!));
    if(page<2)fireEvent.click(screen.getByRole("button",{name:"下一页任务"}));
  }
  expect(shown).toEqual(Array.from({length:15},(_,i)=>`恢复 历史任务${19-i}`));
  expect((screen.getByRole("button",{name:"下一页任务"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button",{name:"导出全部任务 CSV"})).toBeNull();
  expect(api.exportTasks).not.toHaveBeenCalled();
});

it("returns to pending tasks when the panel is reopened",()=>{
  const task={id:"done",title:"已完成的事",description:"",priority:"med" as const,status:"completed" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:"2026-11-13"};
  const {rerender}=render(<TaskPanel snapshot={{...snapshot,tasks:[task]}} onSnapshot={()=>{}} panelVisible/>);
  fireEvent.click(screen.getByRole("button",{name:"已完成 1"}));
  expect(screen.getByRole("button",{name:`恢复 ${task.title}`})).toBeTruthy();
  rerender(<TaskPanel snapshot={{...snapshot,tasks:[task]}} onSnapshot={()=>{}} panelVisible={false}/>);
  rerender(<TaskPanel snapshot={{...snapshot,tasks:[task]}} onSnapshot={()=>{}} panelVisible/>);
  expect(screen.queryByRole("button",{name:`恢复 ${task.title}`})).toBeNull();
  expect(screen.getByRole("button",{name:"待办 0"}).classList.contains("active")).toBe(true);
});

it.each(["tasks","settings","wardrobe","editor"])("keeps the quit entry available at the bottom in %s",async(view)=>{
  vi.mocked(api.quit).mockReset().mockResolvedValue();
  render(<TaskPanel snapshot={snapshot} onSnapshot={()=>{}}/>);
  const buttons:Record<string,string>={settings:"设置",wardrobe:"更多装扮",editor:"记下第一件事"};
  if(view==="wardrobe")fireEvent.click(screen.getByRole("button",{name:"设置"}));
  if(view!=="tasks")fireEvent.click(screen.getByRole("button",{name:buttons[view]}));
  const quit=screen.getByRole("button",{name:"退出 Task Sprite"});
  expect(quit.closest(".panel-bottom-bar")).toBeTruthy();
  fireEvent.click(quit);
  await waitFor(()=>expect(api.quit).toHaveBeenCalledTimes(1));
});


it("allows parallel starts while one task is in progress and after completion",()=>{
  const base={description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null};
  const current={...base,id:"a",title:"当前任务"},other={...base,id:"b",title:"另一项任务"};
  const {rerender}=render(<TaskPanel snapshot={{tasks:[current,other],settings:{...snapshot.settings,focusId:current.id}}} onSnapshot={()=>{}}/>);
  expect((screen.getByRole("button",{name:`暂停 ${current.title}`}) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole("button",{name:`开始做 ${other.title}`}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button",{name:/取消当前/})).toBeNull();
  rerender(<TaskPanel snapshot={{tasks:[{...current,status:"completed"},other],settings:snapshot.settings}} onSnapshot={()=>{}}/>);
  expect((screen.getByRole("button",{name:`开始做 ${other.title}`}) as HTMLButtonElement).disabled).toBe(false);
});

it("opens the Powered by website in the system browser", async () => {
  const openWebsite = vi.mocked(api.openWebsite).mockResolvedValue();
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  const link = screen.getByRole("link", { name: "Powered by TBTParent" });
  expect(link.getAttribute("href")).toBe("https://tbtparent.me");
  fireEvent.click(link);
  await waitFor(() => expect(openWebsite).toHaveBeenCalledOnce());
});

it("keeps activation and companions in settings and the task area clear on return", async () => {
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  expect(screen.queryByRole("button", {name:"更多装扮"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"设置"}));
  expect(await screen.findByRole("button", {name:"激活授权"})).toBeTruthy();
  expect(screen.getByRole("region", {name:"伙伴与装扮"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"更多装扮"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name:"返回"}));
  expect(screen.queryByRole("button", {name:"更多装扮"})).toBeNull();
  expect(screen.queryByRole("region", {name:"伙伴与装扮"})).toBeNull();
  expect(screen.getByRole("button", {name:"记下第一件事"})).toBeTruthy();
});

it("keeps breakdown and statistics out of the desktop task panel", () => {
  render(<TaskPanel snapshot={snapshot} onSnapshot={() => {}} />);
  expect(screen.queryByRole("navigation", {name:"主导航"})).toBeNull();
  expect(screen.queryByRole("button", {name:"统计"})).toBeNull();
  expect(screen.queryByRole("button", {name:"汇报"})).toBeNull();
  expect(screen.queryByRole("button", {name:/一句话拆解/})).toBeNull();
  expect(screen.getByRole("button", {name:"记下第一件事"})).toBeTruthy();
});

it("pauses the active task and permits another task after the saved snapshot arrives", async () => {
  const current={id:"a",title:"先做的事",description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-13",updatedAt:"2026-11-13",completedAt:null};
  const other={...current,id:"b",title:"临时插入"};
  const changed=vi.fn();
  const paused={...snapshot,tasks:[{...current,activityLog:[{id:"event",action:"paused" as const,at:"2026-11-14T10:00:00Z"}]},other]};
  vi.mocked(api.execution).mockResolvedValue(paused);
  const {rerender}=render(<TaskPanel snapshot={{...paused,settings:{...snapshot.settings,focusId:current.id}}} onSnapshot={changed}/>);
  fireEvent.click(screen.getByRole("button",{name:`暂停 ${current.title}`}));
  await waitFor(()=>expect(changed).toHaveBeenCalledWith(paused));
  expect(api.execution).toHaveBeenCalledWith(current.id, "idle");
  rerender(<TaskPanel snapshot={paused} onSnapshot={changed}/>);
  expect((screen.getByRole("button",{name:`开始做 ${other.title}`}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("button",{name:`继续做 ${current.title}`})).toBeTruthy();
});

it.each(["fox", "panda", "mint-ghost", "sunset-robot", "snow-shiba", "cream-cat"] as const)("keeps %s out of the four free companion shortcuts", pet => {
  const selected = {...snapshot,looksExpiresAt:"2099-01-01T00:00:00Z",settings:{...snapshot.settings,pet}};
  const {container} = render(<TaskPanel snapshot={selected} onSnapshot={() => {}} />);
  expect(container.querySelector(".pet-options")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"设置"}));
  const footer = container.querySelector(".pet-options")!;
  expect(footer.querySelectorAll("button")).toHaveLength(4);
  expect(Array.from(footer.querySelectorAll(".sprite")).map(s => s.getAttribute("data-pet"))).toEqual(["cat", "shiba", "robot", "ghost"]);
  expect(screen.queryByRole("button", {name:/^当前装扮 /})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"更多装扮"}));
  expect(screen.getByRole("button", {name:"选择装扮 赤狐"})).toBeTruthy();
  expect(screen.queryByRole("button", {name:/^选择免费伙伴 /})).toBeNull();
});

it("does not deduct the pager's flexible blank space from task capacity after starting a task", () => {
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => {
    const style = computed(element);
    if (element.classList.contains("task-pager")) return new Proxy(style, { get(target, key) { return key === "marginTop" ? "410px" : Reflect.get(target, key); } });
    if (element.classList.contains("task-row")) return new Proxy(style, { get(target, key) { return key === "minHeight" ? "78px" : Reflect.get(target, key); } });
    return style;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-list-area") ? 550 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("task-pager") ? 36 : 0; });
  vi.stubGlobal("ResizeObserver", class { constructor(private changed: () => void) {} observe() { this.changed(); } disconnect() {} });
  const tasks = Array.from({ length: 5 }, (_, i) => ({id:String(i),title:`并行列表${i}`,description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-16",updatedAt:"2026-11-16",completedAt:null}));
  const { rerender } = render(<TaskPanel snapshot={{ ...snapshot, tasks }} onSnapshot={()=>{}}/>);
  expect(screen.getAllByRole("button", {name:/^完成 /})).toHaveLength(5);
  rerender(<TaskPanel snapshot={{ ...snapshot, tasks, settings:{...snapshot.settings,focusId:"0"}, workflows:{"0":{state:"working",steps:[]}} }} onSnapshot={()=>{}}/>);
  expect(screen.getAllByRole("button", {name:/^完成 /})).toHaveLength(5);
  expect(screen.queryByRole("navigation", {name:"任务翻页"})).toBeNull();
});

it.each([[500,6],[499,5]])('fits exactly the cards and pager in %ipx of available height', (height,count)=>{
 const computed=window.getComputedStyle.bind(window);
 vi.spyOn(window,'getComputedStyle').mockImplementation(element=>{
  const style=computed(element);
  return new Proxy(style,{get(target,key){
   if(element.classList.contains('task-row')&&key==='minHeight')return '72px';
   if(element.classList.contains('task-page')&&key==='rowGap')return '6px';
   return Reflect.get(target,key);
  }});
 });
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('task-list-area')?height:0;});
 vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('task-pager')?38:0;});
 vi.stubGlobal('ResizeObserver',class{constructor(private changed:()=>void){}observe(){this.changed();}disconnect(){}});
 const tasks=Array.from({length:7},(_,i)=>({id:String(i),title:`高度任务${i}`,description:'',priority:'med' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-16',updatedAt:'2026-11-16',completedAt:null}));
 render(<TaskPanel snapshot={{...snapshot,tasks}} onSnapshot={()=>{}}/>);
 expect(screen.getAllByRole('button',{name:/^完成 /})).toHaveLength(count);
});
it('shows priority as a flag in task metadata, separate from the completion box',()=>{
 const task={id:'priority',title:'清楚区分优先级',description:'',priority:'high' as const,status:'todo' as const,dueDate:null,dueTime:null,createdAt:'2026-11-16',updatedAt:'2026-11-16',completedAt:null};
 render(<TaskPanel snapshot={{...snapshot,tasks:[task]}} onSnapshot={()=>{}}/>);
 const priority=screen.getByLabelText('高优先级');
 expect(priority.closest('.task-meta')).toBeTruthy();
 expect(priority.closest('.task-title-line')).toBeNull();
 expect(priority.querySelector('svg')).toBeTruthy();
});

it('toggles a persistent pin beside settings and reflects the saved preference',async()=>{
 const pinned={...snapshot,settings:{...snapshot.settings,panelPinned:true}};
 vi.mocked(api.preferences).mockResolvedValue(pinned);
 const changed=vi.fn();const {rerender}=render(<TaskPanel snapshot={snapshot} onSnapshot={changed}/>);
 const pin=screen.getByRole('button',{name:'固定任务窗口'});
 expect(pin.closest('.window-actions')).toBe(screen.getByRole('button',{name:'设置'}).closest('.window-actions'));
 fireEvent.click(pin);
 await waitFor(()=>expect(api.preferences).toHaveBeenCalledWith({panelPinned:true}));
 expect(changed).toHaveBeenCalledWith(pinned);
 rerender(<TaskPanel snapshot={pinned} onSnapshot={changed}/>);
 expect(screen.getByRole('button',{name:'取消窗口固定'}).getAttribute('aria-pressed')).toBe('true');
 vi.mocked(api.preferences).mockResolvedValue(snapshot);
 fireEvent.click(screen.getByRole('button',{name:'取消窗口固定'}));
 await waitFor(()=>expect(api.preferences).toHaveBeenCalledWith({panelPinned:false}));
});

function mockContentHeight() {
  vi.stubGlobal("innerHeight",740);
  vi.mocked(api.resizePanel).mockClear();
  vi.mocked(api.resizePanel).mockImplementation(async height => { window.innerHeight=height; return 740; });
  vi.stubGlobal("ResizeObserver",class { observe(){} disconnect(){} });
  vi.spyOn(HTMLElement.prototype,"clientHeight","get").mockImplementation(function(this:HTMLElement){ return this.classList.contains("task-list-area") ? window.innerHeight-180 : 0; });
  vi.spyOn(HTMLElement.prototype,"scrollHeight","get").mockImplementation(function(this:HTMLElement){
    if(this.classList.contains("task-page")){const count=this.querySelectorAll('.task-row').length;return count*72+Math.max(0,count-1)*6;}
    return this.classList.contains("empty") ? 200 : 0;
  });
  vi.spyOn(HTMLElement.prototype,"offsetHeight","get").mockImplementation(function(this:HTMLElement){return this.classList.contains("task-pager") ? 38 : 0;});
  const computed=window.getComputedStyle.bind(window);
  vi.spyOn(window,"getComputedStyle").mockImplementation(element=>new Proxy(computed(element),{get(target,key){
    if(element.classList.contains("task-row")&&key==="minHeight")return "72px";
    if(element.classList.contains("task-page")&&key==="rowGap")return "6px";
    return Reflect.get(target,key);
  }}));
}
const heightTasks = (count:number) => Array.from({length:count},(_,i)=>({id:String(i),title:`高度任务${i}`,description:"",priority:"med" as const,status:"todo" as const,dueDate:null,dueTime:null,createdAt:"2026-11-16",updatedAt:"2026-11-16",completedAt:null}));
it("shrinks the actual window for empty and short lists, and grows it to fit six tasks",async()=>{
  mockContentHeight();
  const {rerender}=render(<TaskPanel snapshot={{...snapshot,tasks:[]}} onSnapshot={()=>{}}/>);
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(380));
  expect(screen.queryByRole("navigation",{name:"任务翻页"})).toBeNull();
  rerender(<TaskPanel snapshot={{...snapshot,tasks:heightTasks(1)}} onSnapshot={()=>{}}/>);
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(260));
  rerender(<TaskPanel snapshot={{...snapshot,tasks:heightTasks(6)}} onSnapshot={()=>{}}/>);
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(642));
  expect(screen.getAllByRole("button",{name:/^完成 /})).toHaveLength(6);
  rerender(<TaskPanel snapshot={{...snapshot,tasks:heightTasks(1)}} onSnapshot={()=>{}}/>);
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(260));
});
it("keeps six-task capacity after the native window shrinks on the last page",async()=>{
  mockContentHeight();
  render(<TaskPanel snapshot={{...snapshot,tasks:heightTasks(7)}} onSnapshot={()=>{}}/>);
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(680));
  fireEvent.click(screen.getByRole("button",{name:"下一页任务"}));
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(290));
  expect(screen.getByText("2 / 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"上一页任务"}));
  await waitFor(()=>expect(api.resizePanel).toHaveBeenLastCalledWith(680));
  expect(screen.getAllByRole("button",{name:/^完成 /})).toHaveLength(6);
});
