import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Settings } from "./Settings";
import { api } from "./api";
vi.mock("./api", () => ({ api: { identity: vi.fn(), preferences: vi.fn() }, message: String }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows the persistent local user ID and copies its full value", async () => {
  const userId = "cdd89012-fb01-4343-8ac8-fc8bf226f384";
  vi.mocked(api.identity).mockResolvedValue({ userId, createdAt: "2026-11-13" });
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<Settings settings={{pet:"ghost",focusId:null,notifications:true,summaryTime:"09:00",quietStart:"23:00",quietEnd:"08:00",reduceMotion:false,showHint:true,petX:null,petY:null}} onClose={() => {}} onChange={() => {}} />);
  await waitFor(() => expect(screen.getByText(userId)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "复制本地用户编号" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(userId));
});
