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
  fireEvent.click(screen.getByRole("button", {name:"选择装扮 赤狐"}));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({tasks:[],settings:selected}));
  rerender(<Wardrobe settings={selected} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={() => {}} />);
  expect(screen.getByRole("button", {name:"选择装扮 赤狐"}).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByLabelText("装扮预览")).toBeNull();
});
it.each([undefined, "2020-01-01T00:00:00Z"])("locks premium selection without a valid activation (%s)", (looksExpiresAt) => {
  const activate = vi.fn();
  render(<Wardrobe settings={settings} looksExpiresAt={looksExpiresAt} onActivate={activate} onChange={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"选择装扮 赤狐"}));
  expect(screen.queryByRole("button", {name:"使用赤狐"})).toBeNull();
  expect(activate).toHaveBeenCalledOnce();
  expect(api.preferences).not.toHaveBeenCalled();
});

it("shows all six exclusive looks across two pages without free companions", () => {
  render(<Wardrobe settings={settings} onChange={() => {}} onClose={() => {}} />);
  expect(screen.queryByRole("button", {name:/免费伙伴/})).toBeNull();
  expect(screen.getAllByRole("button", {name:/^选择装扮 /}).map(b=>b.getAttribute("aria-label"))).toEqual(["选择装扮 赤狐", "选择装扮 团子熊猫", "选择装扮 薄荷幽灵", "选择装扮 落日机器人"]);
  fireEvent.click(screen.getByRole("button", {name:"下一页装扮"}));
  expect(screen.getAllByRole("button", {name:/^选择装扮 /}).map(b=>b.getAttribute("aria-label"))).toEqual(["选择装扮 霜雪柴犬", "选择装扮 奶油橘猫"]);
  expect((screen.getByRole("button", {name:"下一页装扮"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", {name:"上一页装扮"}));
  expect(screen.getByRole("button", {name:"选择装扮 赤狐"})).toBeTruthy();
});
it.each([
  ["fox","赤狐",false], ["panda","团子熊猫",false],
  ["mint-ghost","薄荷幽灵",false], ["sunset-robot","落日机器人",false],
  ["snow-shiba","霜雪柴犬",true], ["cream-cat","奶油橘猫",true],
] as const)("selects exclusive %s with one click without changing the other preference", async (pet, name, secondPage) => {
  const patch = {pet};
  const selected={tasks:[],settings:{...settings,...patch}};
  vi.mocked(api.preferences).mockResolvedValue(selected);
  const onChange=vi.fn();
  render(<Wardrobe settings={settings} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={() => {}} />);
  if(secondPage) fireEvent.click(screen.getByRole("button", {name:"下一页装扮"}));
  fireEvent.click(screen.getByRole("button", {name:`选择装扮 ${name}`}));
  await waitFor(()=>expect(onChange).toHaveBeenCalledWith(selected));
  expect(api.preferences).toHaveBeenCalledExactlyOnceWith(patch);
  expect(screen.queryByLabelText("装扮预览")).toBeNull();
});

it("keeps the wardrobe open and selection unchanged when saving a licensed look fails", async () => {
  vi.mocked(api.preferences).mockRejectedValueOnce(new Error("保存失败"));
  const onChange = vi.fn();
  render(<Wardrobe settings={settings} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", {name:"选择装扮 赤狐"}));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("保存失败"));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name:"选择装扮 赤狐"}).getAttribute("aria-pressed")).toBe("false");
});

it.each([
 ["mint-ghost","薄荷主题"],["sunset-robot","落日主题"],
 ["snow-shiba","霜雪主题"],["cream-cat","奶油主题"],
] as const)("keeps %s skin selectable separately from its companion", async (skin,name) => {
 const current={...settings,pet:"sunset-robot" as const};
 const selected={tasks:[],settings:{...current,skin}};
 vi.mocked(api.preferences).mockResolvedValue(selected);
 const onChange=vi.fn();
 const {rerender}=render(<Wardrobe settings={current} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"界面皮肤 4"}));
 fireEvent.click(screen.getByRole("button",{name:`选择皮肤 ${name}`}));
 await waitFor(()=>expect(onChange).toHaveBeenCalledWith(selected));
 expect(api.preferences).toHaveBeenCalledExactlyOnceWith({skin});
 rerender(<Wardrobe settings={selected.settings} looksExpiresAt="2099-01-01T00:00:00Z" onChange={onChange} onClose={()=>{}}/>);
 expect(screen.getByRole("button",{name:`选择皮肤 ${name}`}).getAttribute("aria-pressed")).toBe("true");
 fireEvent.click(screen.getByRole("button",{name:"专属精灵 6"}));
 expect(screen.getByRole("button",{name:"选择装扮 落日机器人"}).getAttribute("aria-pressed")).toBe("true");
});
