import { useEffect, useRef, useState } from "react";
import { ArrowLeft, SunHorizon, Sun } from "@phosphor-icons/react";
import { weekSlots, deadlineLabel, type DeadlineTime } from "./deadlines";
export function DatePicker({ value, time, onChange, onClose }: {
  value: string;
  time: string | null;
  onChange: (date: string, time: DeadlineTime | null) => void;
  onClose: () => void;
}) {
  const days = weekSlots();
  const [date, setDate] = useState(() => days.some(d => d.date === value) ? value : days[0].date);
  const selected = days.find(d => d.date === date) ?? days[0];
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [onClose]);
  return (
    <section className="deadline-view" aria-label="选择截止时间">
      <div className="section-heading">
        <h2>安排到什么时候？</h2>
        <button type="button" className="text-button icon-text" aria-label="返回任务编辑" onClick={onClose}><ArrowLeft size={16} />返回</button>
      </div>
      <p className="deadline-help">先选一天，再点上午或下午，即可完成。</p>
      <div className="deadline-days" role="group" aria-label="未来一周">
        {days.map((d, i) => (
          <button type="button" key={d.date} ref={i === 0 ? first : undefined}
            aria-label={`${d.date.slice(0, 4)}年${Number(d.date.slice(5, 7))}月${Number(d.date.slice(8))}日`}
            aria-pressed={selected.date === d.date} onClick={() => setDate(d.date)}>
            <strong>{d.label}</strong><small>{d.shortDate}</small>
          </button>
        ))}
      </div>
      <div className="deadline-periods" role="group" aria-label={`${selected.label}的截止时段`}>
        {([{ time: "12:00", label: "上午", Icon: SunHorizon }, { time: "17:00", label: "下午", Icon: Sun }] as const).map(({ time: t, label, Icon }) => (
          <button type="button" key={t} disabled={!selected.times.includes(t)} aria-label={`${label} ${t} 截止`}
            aria-pressed={value === selected.date && time === t} onClick={() => onChange(selected.date, t)}>
            <Icon size={25} /><strong>{label}</strong><small>{t} 截止</small>
          </button>
        ))}
      </div>
      <div className="deadline-bottom">
        <span>{value ? `原安排：${deadlineLabel(value, time)}` : "17:00 后，从明天开始安排"}</span>
        <button type="button" className="text-button" onClick={() => onChange("", null)}>不设截止时间</button>
      </div>
    </section>
  );
}
