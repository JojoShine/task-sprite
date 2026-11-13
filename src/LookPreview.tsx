import { Sprite } from "./Pet";
import type { PremiumLook } from "./looks";
export function LookPreview({ look }: { look: PremiumLook }) {
  return <span className="look-preview" aria-hidden="true">
    {"src" in look.preview
      ? <img src={look.preview.src} alt="" />
      : <span className="look-tint" style={{ filter: look.preview.filter }}><Sprite pet={look.preview.pet} still /></span>}
  </span>;
}
