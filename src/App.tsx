import { useCallback, useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Snapshot, VisualState } from "./types";
import { api, message } from "./api";
import { useTheme } from "./useTheme";
import { Pet } from "./Pet";
import { TaskPanel } from "./TaskPanel";
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  useTheme(snapshot?.settings.theme, snapshot?.settings.skin, snapshot?.looksExpiresAt);
  const [error, setError] = useState("");
  const [reminderIds, setReminderIds] = useState<string[]>([]);
  const latestSnapshot = useRef<Snapshot | undefined>(undefined);
  latestSnapshot.current = snapshot;
  const reminderDeadlines = useRef<Record<string,string>>({});
  useEffect(()=>{
    if(!snapshot)return;
    setReminderIds(ids=>{
      const valid=ids.filter(id=>snapshot.tasks.some(t=>t.id===id && t.status==='todo' && `${t.dueDate}|${t.dueTime}`===reminderDeadlines.current[id]));
      return valid.length===ids.length?ids:valid;
    });
  },[snapshot]);
  const [panelVisible, setPanelVisible] = useState(false);
  const [animation, setAnimation] = useState<VisualState | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setClock] = useState(0);
  const [notificationWarning, setNotificationWarning] = useState("");
  const refresh = useCallback(async () => {
    setSnapshot(await api.snapshot());
  }, []);
  useEffect(() => {
    let active = true;
    let visibilityVersion = 0;
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
              ["idle", "reminder", "celebrate", "rest", "working", "interaction"].includes(state)
            )
              play(state as VisualState);
          },
        ],
        ["snapshot", (s: Snapshot) => setSnapshot(s)],
        ["reminder-tasks", (ids: string[]) => {
          const tasks=latestSnapshot.current?.tasks||[];
          reminderDeadlines.current=Object.fromEntries(tasks.filter(t=>ids.includes(t.id)).map(t=>[t.id,`${t.dueDate}|${t.dueTime}`]));
          setReminderIds(ids);
        }],
        ["panel-visibility", (visible: boolean) => { visibilityVersion++; setPanelVisible(visible); }],
        ["clock", () => setClock((c) => c + 1)],
        ["sync-status", () => { void refresh().catch(() => {}); }],
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
          if (new URLSearchParams(location.search).get("view") === "pet") {
            const version = visibilityVersion;
            const visible = await api.panelVisible();
            if (active && version === visibilityVersion) setPanelVisible(visible);
          } else {
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
    <Pet snapshot={snapshot} animation={animation} onSnapshot={setSnapshot} panelVisible={panelVisible} reminderIds={reminderIds} />
  ) : (
    <TaskPanel
      snapshot={snapshot}
      onSnapshot={setSnapshot}
      panelVisible={panelVisible}
      reminderIds={reminderIds}
      notificationWarning={notificationWarning}
      animation={animation}
    />
  );
}
