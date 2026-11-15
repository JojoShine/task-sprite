import { Sprite } from "./Pet";
import type { PlannedLook } from "./looks";
export function LookPreview({ look, still = false }: { look: PlannedLook; still?: boolean }) {
  if (look.kind === "皮肤") return <span className="look-preview" aria-hidden="true"><span className="skin-preview" data-skin={look.id}><i /><b /><b /><em /></span></span>;
  return <span className="look-preview" aria-hidden="true"><Sprite pet={look.id} still={still} /></span>;
}
