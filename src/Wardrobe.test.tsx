import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Wardrobe } from "./Wardrobe";
import { api } from "./api";
import type { Settings } from "./types";
vi.mock("./api", () => ({ api: { preferences: vi.fn() }, message: (e: unknown) => String(e) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const settings: Settings = { pet:"ghost", theme:"system", focusId:null, notifications:true, summaryTime:"09:00", quietStart:"23:00", quietEnd:"08:00", showHint:true, reduceMotion:false, petX:null, petY:null };
it("unlocks six looks with a valid offline activation and keeps the selection", async () => {
  const onChange = vi.fn();
  const selected = {...settings, pet:"fox" as const};
  vi.mocked(api.preferences).mockResolvedValue({tasks:[], settings:selected});
  const {rerender} = render(<Wardrobe settings={settings} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"授权装扮 6"}));
  fireEvent.click(screen.getByRole("button", {name:"预览装扮 赤狐"}));
  fireEvent.click(screen.getByRole("button", {name:"使用赤狐"}));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({tasks:[],settings:selected}));
  rerender(<Wardrobe settings={selected} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={() => {}} />);
  expect(screen.getByRole("button", {name:"已选择赤狐"})).toBeTruthy();
});
it.each([undefined, "2020-01-01T00:00:00Z"])("locks premium selection without a valid activation (%s)", (looksExpiresAt) => {
  const activate = vi.fn();
  render(<Wardrobe settings={settings} looksExpiresAt={looksExpiresAt} onActivate={activate} onChange={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"授权装扮 6"}));
  fireEvent.click(screen.getByRole("button", {name:"预览装扮 赤狐"}));
  expect(screen.queryByRole("button", {name:"使用赤狐"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"激活授权"}));
  expect(activate).toHaveBeenCalledOnce();
  expect(api.preferences).not.toHaveBeenCalled();
});

it("keeps all free companions selectable and reports failed changes without unlocking a paid look", async () => {
  const onChange = vi.fn();
  vi.mocked(api.preferences).mockRejectedValueOnce(new Error("暂时无法保存")).mockResolvedValueOnce({tasks:[],settings:{...settings,pet:"cat"}});
  render(<Wardrobe settings={settings} onChange={onChange} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "免费伙伴 4" }));
  expect(screen.getAllByRole("button", { name: /^选择免费伙伴 / })).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "选择免费伙伴 橘猫" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("暂时无法保存"));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "选择免费伙伴 橘猫" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({tasks:[],settings:{...settings,pet:"cat"}}));
  expect(api.preferences).toHaveBeenLastCalledWith({pet:"cat"});
});
