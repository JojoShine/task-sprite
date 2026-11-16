import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Settings } from "./Settings";
import { api } from "./api";
vi.mock("./api", () => ({ api: { syncStatus: vi.fn(async () => ({bound:false, accountId:null,enabled:false,pending:0,conflicts:[],license:null})), preferences: vi.fn(), exportTasks: vi.fn() }, message: String }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("exports all tasks through a save dialog and reports completion or cancellation", async () => {
  let complete!: (path: string | null) => void;
  vi.mocked(api.exportTasks).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("导出失败"));
  render(<Settings settings={{pet:"ghost",focusId:null,notifications:true,summaryTime:"09:00",quietStart:"23:00",quietEnd:"08:00",reduceMotion:false,showHint:true,theme:"system",petX:null,petY:null}} onClose={() => {}} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "导出全部任务 CSV" }));
  expect((screen.getByRole("button", { name: "正在导出…" }) as HTMLButtonElement).disabled).toBe(true);
  complete("/tmp/任务备份.csv");
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("/tmp/任务备份.csv"));
  fireEvent.click(screen.getByRole("button", { name: "导出全部任务 CSV" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "导出全部任务 CSV" })).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "导出全部任务 CSV" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("导出失败"));
});

it("offers code activation without exposing an installation ID or annual-card flow", async () => {
  render(<Settings settings={{pet:"ghost",focusId:null,notifications:true,summaryTime:"09:00",quietStart:"23:00",quietEnd:"08:00",reduceMotion:false,showHint:true,theme:"system",petX:null,petY:null}} onClose={() => {}} onChange={() => {}} />);
  expect(await screen.findByLabelText("授权码")).toBeTruthy();
  expect(screen.getByRole("button", { name: "激活授权" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "本机身份" })).toBeNull();
  expect(screen.queryByText(/本地用户编号|本地数据标识|年卡/)).toBeNull();
  expect(screen.queryByRole("button", { name: "复制本地用户编号" })).toBeNull();
  expect(screen.queryByRole("button", { name: "保存设置" })).toBeNull();
});

const preferences={pet:'robot' as const,focusId:null,notifications:true,summaryTime:'09:00',quietStart:'23:00',quietEnd:'08:00',reduceMotion:false,showHint:true,theme:'system' as const,petX:null,petY:null};
it('saves each preference immediately without closing settings',async()=>{
 const changed=vi.fn(),close=vi.fn();
 vi.mocked(api.preferences).mockResolvedValue({tasks:[],settings:{...preferences,notifications:false}});
 render(<Settings settings={preferences} onClose={close} onChange={changed}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'系统任务提醒'}));
 await waitFor(()=>expect(api.preferences).toHaveBeenCalledWith({notifications:false}));
 expect(changed).toHaveBeenCalledWith(expect.objectContaining({settings:expect.objectContaining({notifications:false})}));
 expect(close).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'保存设置'})).toBeNull();
 vi.mocked(api.preferences).mockResolvedValue({tasks:[],settings:{...preferences,notifications:false,summaryTime:'10:30'}});
 fireEvent.change(screen.getByLabelText('每日集中提醒时间'),{target:{value:'10:30'}});
 await waitFor(()=>expect(api.preferences).toHaveBeenCalledWith({summaryTime:'10:30'}));
});
it('restores a preference and shows the error when immediate saving fails',async()=>{
 vi.mocked(api.preferences).mockRejectedValueOnce(new Error('设置未保存'));
 render(<Settings settings={preferences} onClose={vi.fn()} onChange={vi.fn()}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'系统任务提醒'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('设置未保存'));
 expect((screen.getByRole('checkbox',{name:'系统任务提醒'}) as HTMLInputElement).checked).toBe(true);
});

it('keeps the card-pin setting independent from task-window pinning',()=>{
 const {rerender}=render(<Settings settings={{...preferences,panelPinned:true,cardPinned:false}} onClose={vi.fn()} onChange={vi.fn()}/>);
 expect((screen.getByRole('checkbox',{name:'固定任务卡'}) as HTMLInputElement).checked).toBe(false);
 rerender(<Settings settings={{...preferences,cardPinned:true,panelPinned:false}} onClose={vi.fn()} onChange={vi.fn()}/>);
 expect((screen.getByRole('checkbox',{name:'固定任务卡'}) as HTMLInputElement).checked).toBe(true);
});
