import { it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useTheme } from "./useTheme";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; });
it("follows system changes until an explicit preference overrides them", () => {
  let dark = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({ get matches() { return dark; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
  const { rerender, unmount } = renderHook(({ theme }) => useTheme(theme), { initialProps: { theme: "system" as "system" | "light" | "dark" } });
  expect(document.documentElement.dataset.theme).toBe("dark");
  act(() => { dark = false; listeners.forEach(fn => fn()); });
  expect(document.documentElement.dataset.theme).toBe("light");
  rerender({ theme: "dark" });
  act(() => listeners.forEach(fn => fn()));
  expect(document.documentElement.dataset.theme).toBe("dark");
  rerender({ theme: "system" });
  expect(document.documentElement.dataset.theme).toBe("light");
  unmount(); expect(listeners.size).toBe(0);
});

it("applies a licensed skin to the shared document without changing dark mode and falls back on expiry", () => {
  const {rerender} = renderHook(({expiry}) => useTheme("dark", "mint-ghost", expiry), {initialProps:{expiry:"2099-01-01T00:00:00Z"}});
  expect(document.documentElement.dataset.skin).toBe("mint-ghost");
  expect(document.documentElement.dataset.theme).toBe("dark");
  rerender({expiry:"2020-01-01T00:00:00Z"});
  expect(document.documentElement.dataset.skin).toBe("default");
});
it("drops an expired offline skin on a clock render even when the stored preference is unchanged", () => {
  const now=vi.spyOn(Date,"now").mockReturnValue(Date.parse("2098-01-01T00:00:00Z"));
  const {rerender}=renderHook(()=>useTheme("light","mint-ghost","2099-01-01T00:00:00Z"));
  expect(document.documentElement.dataset.skin).toBe("mint-ghost");
  now.mockReturnValue(Date.parse("2100-01-01T00:00:00Z"));
  rerender();
  expect(document.documentElement.dataset.skin).toBe("default");
  now.mockRestore();
});
