import { it, expect } from "vitest";
import { createDragSession } from "./drag";
it("moves to the latest pointer position even when native position resolves after mouse-up", async () => {
  let resolve!: (p: { x: number; y: number }) => void;
  const origin = new Promise<{ x: number; y: number }>((r) => (resolve = r));
  const positions: { x: number; y: number }[] = [];
  const s = createDragSession({ x: 100, y: 100 }, origin, async (p) => {
    positions.push(p);
  });
  const first = s.update({ x: 90, y: 90 });
  s.update({ x: 60, y: 70 });
  expect(s.moved).toBe(true);
  resolve({ x: 2280, y: 1158 });
  await first;
  await s.finish();
  expect(positions.at(-1)).toEqual({ x: 2240, y: 1128 });
});
it("keeps a click from moving the window", async () => {
  const positions: unknown[] = [];
  const s = createDragSession(
    { x: 100, y: 100 },
    Promise.resolve({ x: 200, y: 200 }),
    async (p) => {
      positions.push(p);
    },
  );
  await s.update({ x: 102, y: 101 });
  expect(await s.finish()).toBe(false);
  expect(positions).toEqual([]);
});
