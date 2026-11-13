import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Settings } from "./Settings";
import { api } from "./api";
vi.mock("./api", () => ({ api: { identity: vi.fn(), preferences: vi.fn(), exportTasks: vi.fn() }, message: String }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows the persistent local user ID and copies its full value", async () => {
  const userId = "cdd89012-fb01-4343-8ac8-fc8bf226f384";
  vi.mocked(api.identity).mockResolvedValue({ userId, createdAt: "2026-11-13" });
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<Settings settings={{pet:"ghost",focusId:null,notifications:true,summaryTime:"09:00",quietStart:"23:00",quietEnd:"08:00",reduceMotion:false,showHint:true,theme:"system",petX:null,petY:null}} onClose={() => {}} onChange={() => {}} />);
  await waitFor(() => expect(screen.getByText(userId)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "复制本地用户编号" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(userId));
});

it("exports all tasks through a save dialog and reports completion or cancellation", async () => {
  vi.mocked(api.identity).mockResolvedValue({ userId: "local", createdAt: "2026-11-13" });
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
