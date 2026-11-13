import type { PetId } from "./types";
export type PremiumLook = {
  id: string;
  name: string;
  kind: "角色" | "皮肤";
  preview: { src: string } | { pet: PetId; filter: string };
};
export const premiumLooks: PremiumLook[] = [
  { id: "fox", name: "赤狐", kind: "角色", preview: { src: "/looks/fox.svg" } },
  { id: "panda", name: "团子熊猫", kind: "角色", preview: { src: "/looks/panda.svg" } },
  { id: "mint-ghost", name: "薄荷幽灵", kind: "皮肤", preview: { pet: "ghost", filter: "hue-rotate(240deg) saturate(.75)" } },
  { id: "sunset-robot", name: "落日机器人", kind: "皮肤", preview: { pet: "robot", filter: "hue-rotate(180deg) saturate(.8)" } },
  { id: "snow-shiba", name: "霜雪柴犬", kind: "皮肤", preview: { pet: "shiba", filter: "grayscale(.8) brightness(1.15)" } },
  { id: "cream-cat", name: "奶油橘猫", kind: "皮肤", preview: { pet: "cat", filter: "saturate(.5) brightness(1.12)" } },
];
