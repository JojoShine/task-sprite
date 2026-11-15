import { expect, it, vi } from "vitest";
import { api } from "./api";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
it("sends only editable task fields to the strict native command", async () => {
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const input = (
      args as {
        input: Record<string, unknown>;
      }
    ).input;
    const extra = Object.keys(input).filter(
      (k) =>
        ![
          "id",
          "title",
          "description",
          "priority",
          "status",
          "dueDate",
          "dueTime", "category",
        ].includes(k),
    );
    if (extra.length) throw new Error("unknown field " + extra[0]);
    return { tasks: [], settings: {} } as any;
  });
  const task = {
    id: "1",
    title: "本地报告",
    description: "",
    priority: "med" as const,
    status: "completed" as const,
    dueDate: null,
    dueTime: null,
    createdAt: "2026-11-13",
    updatedAt: "2026-11-13",
    completedAt: "2026-11-13",
  };
  await expect(api.save(task)).resolves.toMatchObject({ tasks: [] });
});

it("activation sends only the code to native and never exposes an installation identity API", async () => {
  vi.mocked(invoke).mockResolvedValue({bound:true,accountId:"workspace",enabled:false,license:null,pending:0,conflicts:[]});
  await api.activateLicense("TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD");
  expect(invoke).toHaveBeenLastCalledWith("activate_license", {code:"TS-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD"});
  expect("identity" in api).toBe(false);
});
