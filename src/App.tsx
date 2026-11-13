import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Snapshot } from "./types";
import { api, message } from "./api";
import { Pet } from "./Pet";
import { TaskPanel } from "./TaskPanel";
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [notice, setNotice] = useState(false);
  const [clock, setClock] = useState(0);
  const [notificationWarning, setNotificationWarning] = useState("");
  const refresh = useCallback(async () => {
    setSnapshot(await api.snapshot());
  }, []);
  useEffect(() => {
    let active = true;
    let unsub: (() => void)[] = [];
    const register = async () => {
      for (const [event, fn] of [
        ["snapshot", (s: Snapshot) => setSnapshot(s)],
        ["clock", () => setClock((c) => c + 1)],
        [
          "celebrate",
          () => {
            setCelebrating(true);
            setTimeout(() => setCelebrating(false), 4000);
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
            setNotice(true);
            setTimeout(() => setNotice(false), 10000);
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
    <Pet snapshot={snapshot} celebrating={celebrating} notice={notice} />
  ) : (
    <TaskPanel
      snapshot={snapshot}
      onSnapshot={setSnapshot}
      notificationWarning={notificationWarning}
    />
  );
}
