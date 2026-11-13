import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Pet } from "./Pet";
import { api } from "./api";
import type { Snapshot } from "./types";
vi.mock("./api", () => ({ api: { toggle: vi.fn(async () => {}) } }));
const snapshot: Snapshot = {
  tasks: [],
  settings: {
    pet: "cat",
    focusId: null,
    notifications: true,
    summaryTime: "09:00",
    quietStart: "23:00",
    quietEnd: "08:00",
    reduceMotion: false,
    showHint: true,
    petX: null,
    petY: null,
  },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 12));
  vi.spyOn(Math, "random").mockReturnValue(0);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.mocked(api.toggle).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("responds to a single click and opens tasks only on a double click", () => {
  render(<Pet snapshot={snapshot} animation={null} />);
  const pet = screen.getByRole("button", {
    name: "点击互动，双击打开任务面板，拖动可移动精灵",
  });
  fireEvent.click(pet);
  expect(screen.getByText("摸摸头，收到啦。")).toBeTruthy();
  expect(api.toggle).not.toHaveBeenCalled();
  fireEvent.doubleClick(pet);
  expect(api.toggle).toHaveBeenCalledTimes(1);
});
