import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DatePicker } from "./DatePicker";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 9)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("chooses a weekday and morning directly", () => {
  const change = vi.fn(); render(<DatePicker value="" time={null} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  fireEvent.click(screen.getByRole("button", { name: "2026年11月23日 上午" }));
  expect(change).toHaveBeenCalledWith("2026-11-23", "12:00");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("disables elapsed or out-of-window periods and starts tomorrow after 17", () => {
  vi.setSystemTime(new Date(2026, 10, 16, 18));
  render(<DatePicker value="" time={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  expect(screen.queryByRole("button", { name: "2026年11月16日 上午" })).toBeNull();
  expect((screen.getByRole("button", { name: "2026年11月24日 下午" }) as HTMLButtonElement).disabled).toBe(true);
});
it("preserves a legacy date and clears both date and time", () => {
  const change = vi.fn(); render(<DatePicker value="2026-10-01" time={null} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: /截止时间：10月1日/ }));
  fireEvent.click(screen.getByRole("button", { name: "不设截止时间" }));
  expect(change).toHaveBeenCalledWith("", null);
});
it("closes with Escape without changing the deadline", () => {
  const change = vi.fn(); render(<DatePicker value="" time={null} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(change).not.toHaveBeenCalled();
});
it("keeps the popup inside a compact window", () => {
  vi.stubGlobal("innerHeight", 620);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x:30,y:276,top:276,bottom:320,left:30,right:210,width:180,height:44,toJSON:()=>({}) });
  render(<DatePicker value="" time={null} onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止时间" }));
  const top = parseFloat(screen.getByRole("dialog").style.top);
  expect(top).toBeGreaterThan(200); expect(top + 300).toBeLessThanOrEqual(608);
});
