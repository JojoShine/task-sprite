import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DatePicker } from "./DatePicker";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 12));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("opens an actual calendar and selects a day", () => {
  const change = vi.fn();
  render(<DatePicker value="" onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止日期" }));
  expect(screen.getByRole("dialog", { name: "选择截止日期" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "2026年11月15日" }));
  expect(change).toHaveBeenCalledWith("2026-11-15");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("moves across a year boundary and clears an existing date", () => {
  const change = vi.fn();
  const { rerender } = render(
    <DatePicker value="2026-12-31" onChange={change} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /截止日期：/ }));
  fireEvent.click(screen.getByRole("button", { name: "下个月" }));
  fireEvent.click(screen.getByRole("button", { name: "2027年1月2日" }));
  expect(change).toHaveBeenCalledWith("2027-01-02");
  rerender(<DatePicker value="2027-01-02" onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: /截止日期：/ }));
  fireEvent.click(screen.getByRole("button", { name: "不设日期" }));
  expect(change).toHaveBeenLastCalledWith("");
});
it("offers tomorrow and dismisses with Escape", () => {
  const change = vi.fn();
  render(<DatePicker value="" onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止日期" }));
  fireEvent.click(screen.getByRole("button", { name: "明天" }));
  expect(change).toHaveBeenCalledWith("2026-11-14");
  fireEvent.click(screen.getByRole("button", { name: "选择截止日期" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("includes leap day", () => {
  render(<DatePicker value="2028-02-01" onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /截止日期：/ }));
  expect(screen.getByRole("button", { name: "2028年2月29日" })).toBeTruthy();
});
it("keeps the popup near the date field when neither side has enough space", () => {
  vi.stubGlobal("innerHeight", 620);
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("date-trigger")
        ? {
            x: 30, y: 276, top: 276, bottom: 320,
            left: 30, right: 210, width: 180, height: 44,
            toJSON: () => ({}),
          }
        : original.call(this);
    },
  );
  render(<DatePicker value="" onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "选择截止日期" }));
  const top = parseFloat(screen.getByRole("dialog").style.top);
  expect(top).toBeGreaterThan(200);
  expect(top + 338).toBeLessThanOrEqual(608);
});
