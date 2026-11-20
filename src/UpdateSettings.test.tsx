import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpdateSettings, UpdateControls, useAppUpdate } from "./UpdateSettings";
import { api } from "./api";
vi.mock("./api", () => ({api:{checkUpdate:vi.fn(),installUpdate:vi.fn()}}));
function Header({ showControls = false }: { showControls?: boolean }) {
  const updater = useAppUpdate();
  return <><UpdateSettings updater={updater}/>{showControls && <UpdateControls updater={updater}/>}</>;
}
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it("checks in the background and exposes the download icon only for a new version",async()=>{
  let resolve!: (value:Awaited<ReturnType<typeof api.checkUpdate>>)=>void;
  vi.mocked(api.checkUpdate).mockReturnValue(new Promise(done=>{resolve=done;}));
  render(<Header/>);
  expect(api.checkUpdate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button",{name:"应用更新"})).toBeNull();
  await act(async()=>{resolve({currentVersion:"0.2.2",version:"0.2.3",notes:"新的更新"});});
  fireEvent.click(screen.getByRole("button",{name:"应用更新"}));
  expect(screen.getByText("发现新版本 v0.2.3")).toBeTruthy();
  expect(api.installUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("下载安装并重启"));
  expect(api.installUpdate).toHaveBeenCalledWith("0.2.3");
});
it("hides the top bar entry when already up to date",async()=>{
  vi.mocked(api.checkUpdate).mockResolvedValue({currentVersion:"0.2.2",version:null,notes:null});
  render(<Header/>);
  await act(async()=>{});
  expect(api.checkUpdate).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button",{name:"应用更新"})).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("检查更新")).toBeNull();
});
it("silently retries a failed background check and reveals an available update later",async()=>{
  vi.useFakeTimers();
  vi.mocked(api.checkUpdate).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({currentVersion:"0.2.2",version:"0.2.3",notes:null});
  render(<Header/>);
  await act(async()=>{});
  expect(screen.queryByRole("button",{name:"应用更新"})).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(60*60*1000);});
  expect(screen.getByRole("button",{name:"应用更新"})).toBeTruthy();
  expect(api.installUpdate).not.toHaveBeenCalled();
});
it("keeps an available update accessible after its popover is closed",async()=>{
  vi.mocked(api.checkUpdate).mockResolvedValue({currentVersion:"0.2.2",version:"0.2.3",notes:null});
  render(<Header/>);
  fireEvent.click(await screen.findByRole("button",{name:"应用更新"}));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeTruthy();
  expect(api.installUpdate).not.toHaveBeenCalled();
});

it("can check again from settings when the header has no download icon", async () => {
  const latest = { currentVersion: "0.2.6", version: null, notes: null };
  vi.mocked(api.checkUpdate)
    .mockResolvedValueOnce(latest)
    .mockResolvedValueOnce(latest)
    .mockResolvedValueOnce({ ...latest, version: "0.2.7" });
  render(<Header showControls/>);
  await act(async () => {});
  expect(screen.queryByRole("button", {name: "应用更新"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "检查更新"}));
  expect(await screen.findByText("当前已是最新版本")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "检查更新"}));
  expect(await screen.findByRole("button", {name: "应用更新"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "下载安装并重启"}));
  expect(api.installUpdate).toHaveBeenCalledWith("0.2.7");
});
