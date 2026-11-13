export interface Point {
  x: number;
  y: number;
}
export function createDragSession(
  start: Point,
  origin: Promise<Point>,
  move: (point: Point) => Promise<void>,
) {
  let latest = start;
  let moved = false;
  let pending: Promise<void> | null = null;
  const flush = () => {
    if (pending) return pending;
    pending = origin
      .then(async (base) => {
        let sent: Point;
        do {
          sent = latest;
          await move({
            x: base.x + sent.x - start.x,
            y: base.y + sent.y - start.y,
          });
        } while (sent.x !== latest.x || sent.y !== latest.y);
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return {
    get moved() {
      return moved;
    },
    update(point: Point) {
      latest = point;
      if (Math.hypot(point.x - start.x, point.y - start.y) > 5) moved = true;
      return moved ? flush() : Promise.resolve();
    },
    async finish() {
      if (pending) await pending;
      return moved;
    },
  };
}
