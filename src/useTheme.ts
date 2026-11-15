import { useEffect } from "react";
import { renderedSkin } from "./looks";
import type { SkinId, Theme } from "./types";
export function useTheme(preference: Theme = "system", skin?: SkinId, expiresAt?: string | null) {
  const effectiveSkin = renderedSkin(skin, expiresAt);
  useEffect(() => {
    document.documentElement.dataset.skin = effectiveSkin;
  }, [effectiveSkin]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = preference === "system" ? media?.matches ? "dark" : "light" : preference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [preference]);
}
