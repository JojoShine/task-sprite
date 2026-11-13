import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { usePetMotion } from "./usePetMotion";
beforeEach(() => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("plays a short idle action automatically and avoids repeating it", () => {
  const { result } = renderHook(() =>
    usePetMotion({ blocked: false, reduced: false, pet: "shiba" }),
  );
  expect(result.current.activity).toBeNull();
  act(() => vi.advanceTimersByTime(12000));
  const first = result.current.activity;
  expect(first).not.toBeNull();
  act(() => vi.advanceTimersByTime(2200));
  expect(result.current.activity).toBeNull();
  act(() => vi.advanceTimersByTime(12000));
  expect(result.current.activity).not.toBe(first);
});
it("keeps reminders or rest ahead of idle motions", () => {
  const { result, rerender } = renderHook(
    ({ blocked }) => usePetMotion({ blocked, reduced: false, pet: "cat" }),
    { initialProps: { blocked: false } },
  );
  act(() => vi.advanceTimersByTime(12000));
  rerender({ blocked: true });
  act(() => vi.advanceTimersByTime(60000));
  expect(result.current.activity).toBeNull();
});
it("gives click feedback immediately then returns to idle", () => {
  const { result } = renderHook(() =>
    usePetMotion({ blocked: false, reduced: false, pet: "ghost" }),
  );
  act(() => result.current.interact());
  expect(result.current.activity).toBe("tap");
  expect(result.current.caption).toContain("摸摸头");
  act(() => vi.advanceTimersByTime(2200));
  expect(result.current.activity).toBeNull();
  expect(result.current.caption).toBeNull();
});
it("respects reduced motion and cleans up scheduled work", () => {
  const { result, unmount } = renderHook(() =>
    usePetMotion({ blocked: false, reduced: true, pet: "robot" }),
  );
  act(() => vi.advanceTimersByTime(60000));
  expect(result.current.activity).toBeNull();
  act(() => result.current.interact());
  expect(result.current.caption).toBeTruthy();
  expect(result.current.activity).toBeNull();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
