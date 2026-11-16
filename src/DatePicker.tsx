import { useEffect, useRef, useState } from "react";
import { ArrowLeft, SunHorizon, Sun } from "@phosphor-icons/react";
import { weekSlots, deadlineLabel, type DeadlineTime } from "./deadlines";
export function DatePicker({ value, time, onChange, onClose, onSave, saving = false, canSave = true }: {
  value: string;
  time: string | null;
  onChange: (date: string, time: DeadlineTime | null) => void;
  onClose: () => void;
  onSave?: (date: string, time: DeadlineTime) => void;
  saving?: boolean;
  canSave?: boolean;
}) {
  const days = weekSlots();
  const [date, setDate] = useState(() => days.some(d => d.date === value) ? value : days[0].date);
  const [period, setPeriod] = useState<DeadlineTime>(time === "12:00" ? "12:00" : "17:00");
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
      <p className="deadline-help">默认下午 17:00；可先切换上午，点一天即可完成。</p>
      <div className="deadline-days" role="group" aria-label="未来一周">
        {days.map((d, i) => (
          <button type="button" key={d.date} ref={i === 0 ? first : undefined}
            aria-label={`${d.date.slice(0, 4)}年${Number(d.date.slice(5, 7))}月${Number(d.date.slice(8))}日`}
            aria-pressed={selected.date === d.date} onClick={() => { setDate(d.date); onChange(d.date, d.times.includes(period) ? period : d.times[0]); }}>
            <strong>{d.label}</strong><small>{d.shortDate}{d.times.length === 1 ? d.times[0] === "12:00" ? " · 仅上午" : " · 仅下午" : ""}</small>
          </button>
        ))}
      </div>
      <div className="deadline-periods" role="group" aria-label="截止时段">
        {([{ time: "12:00", label: "上午", Icon: SunHorizon }, { time: "17:00", label: "下午", Icon: Sun }] as const).map(({ time: t, label, Icon }) => (
          <button type="button" key={t} aria-label={`${label} ${t} 截止`}
            aria-pressed={period === t} onClick={() => setPeriod(t)}>
            <Icon size={25} /><strong>{label}</strong><small>{t} 截止</small>
          </button>
        ))}
      </div>
      <div className="deadline-bottom">
        <span>{value ? `原安排：${deadlineLabel(value, time)}` : "17:00 后，从明天开始安排"}</span>
        <button type="button" className="text-button" onClick={() => onChange("", null)}>不设截止时间</button>
      </div>
      {onSave && <div className="editor-save-bar"><button type="button" className="primary save" disabled={saving || !canSave} onClick={() => onSave(selected.date, selected.times.includes(period) ? period : selected.times[0])}>{saving ? "正在保存…" : "保存任务"}</button></div>}
    </section>
  );
}
