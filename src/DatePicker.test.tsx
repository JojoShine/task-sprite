import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DatePicker } from "./DatePicker";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 9)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("switches to morning before committing a day in one click", () => {
  const change = vi.fn();
  render(<DatePicker value="" time={null} onChange={change} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "上午 12:00 截止" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "2026年11月23日" }));
  expect(change).toHaveBeenCalledWith("2026-11-23", "12:00");
});
it("starts tomorrow after 17 and commits only the allowed period at the boundary", () => {
  vi.setSystemTime(new Date(2026, 10, 16, 18));
  const change = vi.fn();
  render(<DatePicker value="" time={null} onChange={change} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "2026年11月16日" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2026年11月24日" }));
  expect(change).toHaveBeenCalledWith("2026-11-24", "12:00");
});
it("preserves a legacy date until explicitly selecting or clearing", () => {
  const change = vi.fn();
  render(<DatePicker value="2026-10-01" time={null} onChange={change} onClose={() => {}} />);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "不设截止时间" }));
  expect(change).toHaveBeenCalledWith("", null);
});
it("Escape cancels a pending day without changing saved data", () => {
  const change = vi.fn(), close = vi.fn();
  render(<DatePicker value="2026-11-16" time="17:00" onChange={change} onClose={close} />);
  fireEvent.click(screen.getByRole("button", { name: "上午 12:00 截止" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1); expect(change).not.toHaveBeenCalled();
});

it("commits a clicked day with the afternoon default", () => {
  const change = vi.fn();
  render(<DatePicker value="" time={null} onChange={change} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "2026年11月17日" }));
  expect(change).toHaveBeenCalledWith("2026-11-17", "17:00");
});
it("uses the allowed morning slot at the end of the valid window", () => {
  const change = vi.fn();
  render(<DatePicker value="" time={null} onChange={change} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "2026年11月23日" }));
  expect(change).toHaveBeenCalledWith("2026-11-23", "12:00");
});
