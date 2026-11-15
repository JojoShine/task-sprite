import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SyncSettings } from "./SyncSettings";
import { api } from "./api";
vi.mock("./api", () => ({ api: { syncStatus: vi.fn(), activateLicense: vi.fn(), enableSync: vi.fn(), pauseSync: vi.fn(), syncNow: vi.fn(), deactivateLicense: vi.fn() }, message: String }));
const license = {accountId:"workspace", codeHint:"TS-••••-ABCD", expiresAt:"2027-11-14T00:00:00Z", deviceLimit:3, devicesUsed:1};
const activated = {bound:true,accountId:"workspace",enabled:false,pending:2,conflicts:[],license};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it("activation clears the code and waits for separate task merge consent", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,bound:false,accountId:null,license:null});
  vi.mocked(api.activateLicense).mockResolvedValue(activated);
  vi.mocked(api.enableSync).mockResolvedValue({...activated,enabled:true,pending:0});
  render(<SyncSettings onChange={() => {}} />);
  const input = await screen.findByLabelText("授权码");
  fireEvent.change(input,{target:{value:"TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD"}});
  fireEvent.click(screen.getByRole("button",{name:"激活授权"}));
  await screen.findByText(/上传本机任务/);
  expect(api.activateLicense).toHaveBeenCalledWith("TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD");
  expect(screen.queryByDisplayValue("TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD")).toBeNull();
  expect(api.enableSync).not.toHaveBeenCalled();
  expect(api.syncNow).not.toHaveBeenCalled();
  expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"确认合并并开启同步"}));
  expect(await screen.findByRole("button",{name:"暂停同步"})).toBeTruthy();
});
it("pausing preserves activation and deactivation requires a separate confirmation", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,enabled:true});
  vi.mocked(api.pauseSync).mockResolvedValue(activated);
  render(<SyncSettings onChange={() => {}} />);
  fireEvent.click(await screen.findByRole("button",{name:"暂停同步"}));
  expect(await screen.findByRole("button",{name:"确认合并并开启同步"})).toBeTruthy();
  expect(api.deactivateLicense).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"停用此电脑"}));
  expect(api.deactivateLicense).not.toHaveBeenCalled();
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,bound:false,enabled:false,license:null});
  fireEvent.click(screen.getByRole("button",{name:"确认停用此电脑"}));
  expect(await screen.findByRole("button",{name:"激活授权"})).toBeTruthy();
  await waitFor(() => expect(api.deactivateLicense).toHaveBeenCalledTimes(1));
});
it("activation errors preserve the entry for correction and never enable sync", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,bound:false,license:null});
  vi.mocked(api.activateLicense).mockRejectedValue(new Error("授权码无效"));
  render(<SyncSettings onChange={() => {}} />);
  fireEvent.change(await screen.findByLabelText("授权码"),{target:{value:"wrong"}});
  fireEvent.click(screen.getByRole("button",{name:"激活授权"}));
  expect(await screen.findByText(/授权码无效/)).toBeTruthy();
  expect((screen.getByLabelText("授权码") as HTMLInputElement).value).toBe("wrong");
  expect(api.enableSync).not.toHaveBeenCalled();
});

it("keeps an existing activation visible without demanding a new code when its summary is unavailable", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,enabled:true,license:null});
  render(<SyncSettings onChange={() => {}} />);
  expect(await screen.findByText(/此电脑已激活/)).toBeTruthy();
  expect(screen.queryByLabelText("授权码")).toBeNull();
  expect(screen.queryByRole("button",{name:"立即同步"})).toBeNull();
  expect(screen.getByText(/任务变更自动同步/)).toBeTruthy();
});

it("recovers the same activated desktop and resumes already-enabled synchronization", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,enabled:true,license:null});
  vi.mocked(api.activateLicense).mockResolvedValue({...activated,enabled:true});
  vi.mocked(api.syncNow).mockResolvedValue({...activated,enabled:true,pending:0});
  render(<SyncSettings onChange={() => {}} />);
  fireEvent.click(await screen.findByRole("button",{name:"恢复云同步"}));
  fireEvent.change(screen.getByLabelText("授权码"),{target:{value:"TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD"}});
  fireEvent.click(screen.getByRole("button",{name:"验证并恢复同步"}));
  expect(await screen.findByText("云同步已恢复。")).toBeTruthy();
  expect(api.enableSync).not.toHaveBeenCalled();
  expect(api.syncNow).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("授权码")).toBeNull();
  expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
});
it("retains the recovery form and original activation when verification fails", async () => {
  vi.mocked(api.syncStatus).mockResolvedValue({...activated,enabled:true,license:null});
  vi.mocked(api.activateLicense).mockRejectedValue(new Error("授权码无效"));
  render(<SyncSettings onChange={() => {}} />);
  fireEvent.click(await screen.findByRole("button",{name:"恢复云同步"}));
  fireEvent.change(screen.getByLabelText("授权码"),{target:{value:"wrong"}});
  fireEvent.click(screen.getByRole("button",{name:"验证并恢复同步"}));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((screen.getByLabelText("授权码") as HTMLInputElement).value).toBe("wrong");
  expect(api.syncNow).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"暂停同步"})).toBeTruthy();
});
