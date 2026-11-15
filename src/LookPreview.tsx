import { Sprite } from "./Pet";
import type { PlannedLook } from "./looks";
export function LookPreview({ look, still = false }: { look: PlannedLook; still?: boolean }) {
  return <span className="look-preview" aria-hidden="true"><Sprite pet={look.id} still={still} /></span>;
}
