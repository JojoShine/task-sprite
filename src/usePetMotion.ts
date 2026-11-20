import { useCallback, useEffect, useRef, useState } from "react";
import type { PetId } from "./types";
export type PetActivity = "peek" | "wave" | "stretch" | "settle" | "tap";
const activities: PetActivity[] = ["peek", "wave", "stretch", "settle"];
const captions = [
  "摸摸头，收到啦。",
  "我在呢，慢慢来。",
  "好啦，陪你做下一件事。",
];
export function usePetMotion({
  blocked,
  reduced,
  pet,
  ambient = true,
}: {
  blocked: boolean;
  reduced: boolean;
  pet: PetId;
  ambient?: boolean;
}) {
  const [activity, setActivity] = useState<PetActivity | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [sequence, setSequence] = useState(0);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [systemReduced, setSystemReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const last = useRef<PetActivity | null>(null);
  const lastCaption = useRef<string | null>(null);
  const interaction = useRef<() => void>(() => {});
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(media?.matches ?? false);
    media?.addEventListener("change", change);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media?.removeEventListener("change", change);
    };
  }, []);
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const paused = blocked || reduced || systemReduced || hidden;
    const clear = () => {
      clearTimeout(idleTimer);
      clearTimeout(endTimer);
    };
    const schedule = () => {
      if (!ambient || paused || !alive) return;
      idleTimer = setTimeout(
        () => {
          const choices = activities.filter((a) => a !== last.current);
          const next = choices[Math.floor(Math.random() * choices.length)];
          last.current = next;
          setActivity(next);
          setSequence((v) => v + 1);
          endTimer = setTimeout(() => {
            if (!alive) return;
            setActivity(null);
            schedule();
          }, 1800);
        },
        12000 + Math.floor(Math.random() * 16000),
      );
    };
    setActivity(null);
    setCaption(null);
    schedule();
    interaction.current = () => {
      clear();
      if (ambient) {
        const choices = captions.filter((c) => c !== lastCaption.current);
        const text = choices[Math.floor(Math.random() * choices.length)];
        lastCaption.current = text;
        setCaption(text);
      }
      if (!paused) {
        setActivity("tap");
        setSequence((v) => v + 1);
      }
      endTimer = setTimeout(() => {
        if (!alive) return;
        setActivity(null);
        setCaption(null);
        schedule();
      }, 1800);
    };
    return () => {
      alive = false;
      clear();
      interaction.current = () => {};
    };
  }, [ambient, blocked, reduced, systemReduced, hidden, pet]);
  const interact = useCallback(() => interaction.current(), []);
  return { activity, caption, sequence, interact };
}
