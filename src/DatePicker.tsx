import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarBlank, CaretDown, X } from "@phosphor-icons/react";
import { weekSlots, deadlineLabel, type DeadlineTime } from "./deadlines";
export function DatePicker({ value, time, onChange }: {
  value: string;
  time: string | null;
  onChange: (date: string, time: DeadlineTime | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 360 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const days = weekSlots();
  const label = value ? deadlineLabel(value, time) : "安排到周几";
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!popup.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    (popup.current?.querySelector('[aria-pressed="true"], .week-grid button:not(:disabled)') as HTMLElement | null)?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  function toggle() {
    if (open) { close(); return; }
    const r = trigger.current!.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const height = 300;
    setPosition({
      left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)),
      top: r.bottom + 8 + height <= window.innerHeight - 12 ? r.bottom + 8 : r.top - 8 - height >= 12 ? r.top - 8 - height : Math.max(12, Math.min(r.bottom + 8, window.innerHeight - height - 12)),
      width,
    });
    setOpen(true);
  }
  function select(date: string, time: DeadlineTime | null) { onChange(date, time); close(); }
  return <>
    <button className={`date-trigger ${value ? "has-date" : ""}`} ref={trigger} type="button"
      aria-label={value ? `截止时间：${label}` : "选择截止时间"} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
      <CalendarBlank size={18} /><span>{label}</span><CaretDown size={13} />
    </button>
    {open && createPortal(<div id={id} ref={popup} role="dialog" aria-label="选择截止时间" className="week-popover" style={position}>
      <div className="week-heading"><div><strong>接下来的一周</strong><span>上午 12:00 · 下午 17:00 截止</span></div><button type="button" aria-label="关闭时间选择" onClick={close}><X size={17} /></button></div>
      <div className="week-grid">{days.map(d => <div className="week-day" key={d.date}>
        <strong>{d.label}</strong><small>{d.shortDate}{d.label === "今天" || d.label === "明天" ? ` ${d.weekday}` : ""}</small>
        <div>{(["12:00", "17:00"] as const).map(t => <button type="button" key={t} disabled={!d.times.includes(t)}
          aria-label={`${d.date.slice(0,4)}年${Number(d.date.slice(5,7))}月${Number(d.date.slice(8))}日 ${t === "12:00" ? "上午" : "下午"}`}
          aria-pressed={d.date === value && t === time} onClick={() => select(d.date, t)}>{t === "12:00" ? "上午" : "下午"}</button>)}</div>
      </div>)}</div>
      <div className="week-foot"><span>17:00 后，从明天开始安排</span><button type="button" onClick={() => select("", null)}>不设截止时间</button></div>
    </div>, document.body)}
  </>;
}
