import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpdateSettings } from "./UpdateSettings";
import { api } from "./api";
vi.mock("./api", () => ({api:{checkUpdate:vi.fn(),installUpdate:vi.fn()}}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("checks on request and installs only the version the user saw",async()=>{
  vi.mocked(api.checkUpdate).mockResolvedValue({currentVersion:"0.2.2",version:"0.2.3",notes:"新的更新"});
  render(<UpdateSettings/>);
  expect(api.checkUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"应用更新"}));
  await screen.findByText("发现新版本 v0.2.3");
  expect(api.installUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("下载安装并重启"));
  expect(api.installUpdate).toHaveBeenCalledWith("0.2.3");
});
it("offers retry after a failed check and never offers an unverified download",async()=>{
  vi.mocked(api.checkUpdate).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({currentVersion:"0.2.2",version:null,notes:null});
  render(<UpdateSettings/>);
  fireEvent.click(screen.getByRole("button",{name:"应用更新"}));
  await screen.findByRole("alert");
  expect(screen.queryByText("下载安装并重启")).toBeNull();
  fireEvent.click(screen.getByText("检查更新"));
  await screen.findByText("当前 v0.2.2，已是最新版本");
  expect(screen.queryByRole("alert")).toBeNull();
});
it("keeps the update entry visible after closing its popover without installing",async()=>{
  vi.mocked(api.checkUpdate).mockResolvedValue({currentVersion:"0.2.2",version:"0.2.3",notes:null});
  render(<UpdateSettings/>);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"应用更新"}));
  await screen.findByText("发现新版本 v0.2.3");
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button",{name:"应用更新"})).toBeTruthy();
  expect(api.installUpdate).not.toHaveBeenCalled();
});
