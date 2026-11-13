import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { localDay } from "./domain";
export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    value ? new Date(`${value}T12:00:00`) : new Date(),
  );
  const [position, setPosition] = useState({ left: 0, top: 0, width: 304 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const today = localDay();
  const label = value
    ? `${Number(value.slice(5, 7))}月${Number(value.slice(8))}日`
    : "不设截止日期";
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !popup.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    (
      popup.current?.querySelector(
        '[aria-pressed="true"]',
      ) as HTMLElement | null
    )?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  function toggle() {
    if (open) {
      close();
      return;
    }
    const r = trigger.current!.getBoundingClientRect();
    const width = Math.min(304, window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      top:
        r.bottom + 8 + 338 <= window.innerHeight - 12
          ? r.bottom + 8
          : r.top - 8 - 338 >= 12
            ? r.top - 8 - 338
            : Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 350)),
      width,
    });
    setMonth(value ? new Date(`${value}T12:00:00`) : new Date());
    setOpen(true);
  }
  function select(date: string) {
    onChange(date);
    close();
  }
  const year = month.getFullYear(),
    m = month.getMonth();
  const first = new Date(year, m, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(year, m, 1 - offset + i, 12),
  );
  return (
    <>
      <button
        className={`date-trigger ${value ? "has-date" : ""}`}
        ref={trigger}
        type="button"
        aria-label={value ? `截止日期：${label}` : "选择截止日期"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <CalendarBlank size={18} />
        <span>{label}</span>
        <CaretDown size={14} />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={popup}
            role="dialog"
            aria-label="选择截止日期"
            className="calendar-popover"
            style={position}
          >
            <div className="calendar-heading">
              <button
                type="button"
                aria-label="上个月"
                onClick={() => setMonth(new Date(year, m - 1, 1, 12))}
              >
                <CaretLeft size={18} />
              </button>
              <strong>
                {year}年{m + 1}月
              </strong>
              <button
                type="button"
                aria-label="下个月"
                onClick={() => setMonth(new Date(year, m + 1, 1, 12))}
              >
                <CaretRight size={18} />
              </button>
            </div>
            <div className="calendar-week" aria-hidden="true">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-days">
              {days.map((d) => {
                const key = localDay(d);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`}
                    aria-pressed={key === value}
                    data-today={key === today}
                    data-outside={d.getMonth() !== m}
                    onClick={() => select(key)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="calendar-shortcuts">
              <button type="button" onClick={() => select(today)}>
                今天
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  select(localDay(d));
                }}
              >
                明天
              </button>
              <button type="button" onClick={() => select("")}>
                不设日期
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
