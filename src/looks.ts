import type { FreePetId, PetId, SkinId } from "./types";
export type PlannedLook = {
  id: PetId;
  name: string;
  kind: "角色" | "皮肤";
  preview: { src: string } | { pet: FreePetId; filter: string };
};
export const plannedLooks: PlannedLook[] = [
  { id: "fox", name: "赤狐", kind: "角色", preview: { src: "/pets/fox.png" } },
  { id: "panda", name: "团子熊猫", kind: "角色", preview: { src: "/pets/panda.png" } },
  { id: "mint-ghost", name: "薄荷幽灵", kind: "角色", preview: { pet: "ghost", filter: "hue-rotate(240deg) saturate(.75)" } },
  { id: "sunset-robot", name: "落日机器人", kind: "角色", preview: { pet: "robot", filter: "hue-rotate(180deg) saturate(.8)" } },
  { id: "snow-shiba", name: "霜雪柴犬", kind: "角色", preview: { pet: "shiba", filter: "grayscale(.8) brightness(1.15)" } },
  { id: "cream-cat", name: "奶油橘猫", kind: "角色", preview: { pet: "cat", filter: "saturate(.5) brightness(1.12)" } },
];

export const interfaceSkins: PlannedLook[] = [
  { id: "mint-ghost", name: "薄荷主题", kind: "皮肤", preview: { pet: "ghost", filter: "hue-rotate(240deg) saturate(.75)" } },
  { id: "sunset-robot", name: "落日主题", kind: "皮肤", preview: { pet: "robot", filter: "hue-rotate(180deg) saturate(.8)" } },
  { id: "snow-shiba", name: "霜雪主题", kind: "皮肤", preview: { pet: "shiba", filter: "grayscale(.8) brightness(1.15)" } },
  { id: "cream-cat", name: "奶油主题", kind: "皮肤", preview: { pet: "cat", filter: "saturate(.5) brightness(1.12)" } },
];

export function hasLicensedLooks(expiresAt?: string | null) {
  return !!expiresAt && Date.parse(expiresAt) > Date.now();
}
export function renderedPet(pet: PetId, expiresAt?: string | null): PetId {
  if (hasLicensedLooks(expiresAt)) return pet;
  const look = plannedLooks.find(item => item.id === pet);
  return look ? ("pet" in look.preview ? look.preview.pet : pet === "fox" ? "shiba" : "cat") : pet;
}

export function renderedSkin(skin?: SkinId, expiresAt?: string | null): SkinId {
  return skin && hasLicensedLooks(expiresAt) ? skin : "default";
}
