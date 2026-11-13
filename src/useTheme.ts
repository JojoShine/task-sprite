import { useEffect } from "react";
import type { Theme } from "./types";
export function useTheme(preference: Theme = "system") {
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
