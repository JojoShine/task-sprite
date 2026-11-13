import { useCallback, useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Snapshot, VisualState } from "./types";
import { api, message } from "./api";
import { Pet } from "./Pet";
import { TaskPanel } from "./TaskPanel";
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [animation, setAnimation] = useState<VisualState | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setClock] = useState(0);
  const [notificationWarning, setNotificationWarning] = useState("");
  const refresh = useCallback(async () => {
    setSnapshot(await api.snapshot());
  }, []);
  useEffect(() => {
    let active = true;
    let unsub: (() => void)[] = [];
    const play = (state: VisualState, duration = 5000) => {
      if (animationTimer.current) clearTimeout(animationTimer.current);
      setAnimation(state);
      animationTimer.current = setTimeout(() => setAnimation(null), duration);
    };
    const register = async () => {
      for (const [event, fn] of [
        [
          "preview-animation",
          (state: unknown) => {
            if (
              typeof state === "string" &&
              ["idle", "reminder", "celebrate", "rest"].includes(state)
            )
              play(state as VisualState);
          },
        ],
        ["snapshot", (s: Snapshot) => setSnapshot(s)],
        ["clock", () => setClock((c) => c + 1)],
        [
          "celebrate",
          () => {
            play("celebrate", 4000);
          },
        ],
        [
          "notification-status",
          (status: string) =>
            setNotificationWarning(
              status === "granted"
                ? ""
                : "系统通知尚未开启。精灵提示仍可用，请到提醒设置中开启。",
            ),
        ],
        [
          "notification-warning",
          (text: string) => setNotificationWarning(text),
        ],
        [
          "reminder",
          () => {
            play("reminder", 10000);
          },
        ],
      ] as const) {
        const off = await listen<any>(event, (e) => {
          if (active) (fn as (v: any) => void)(e.payload);
        });
        if (active) unsub.push(off);
        else off();
      }
      try {
        if (active) {
          await refresh();
          if (new URLSearchParams(location.search).get("view") !== "pet") {
            const status = await api.notificationStatus();
            if (status !== "granted")
              setNotificationWarning(
                "系统通知尚未开启。精灵提示仍可用，请到提醒设置中开启。",
              );
          }
        }
      } catch (e) {
        if (active) setError(message(e));
      }
    };
    void register();
    return () => {
      active = false;
      if (animationTimer.current) clearTimeout(animationTimer.current);
      unsub.forEach((off) => off());
    };
  }, [refresh]);
  const pet = new URLSearchParams(location.search).get("view") === "pet";
  if (!snapshot)
    return pet ? (
      <button className="loading-pet" onClick={() => void api.toggle()}>
        ✦
      </button>
    ) : (
      <div className="startup">
        <h2>Task Sprite</h2>
        <p>{error || "正在打开你的本地任务…"}</p>
        <button
          onClick={() => {
            setError("");
            void refresh().catch((e) => setError(message(e)));
          }}
        >
          重试
        </button>
      </div>
    );
  return pet ? (
    <Pet snapshot={snapshot} animation={animation} />
  ) : (
    <TaskPanel
      snapshot={snapshot}
      onSnapshot={setSnapshot}
      notificationWarning={notificationWarning}
      animation={animation}
    />
  );
}
