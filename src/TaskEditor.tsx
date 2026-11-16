import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CalendarBlank, CaretRight, CaretUp, Plus, Trash } from "@phosphor-icons/react";
import type { Task, TaskInput, TaskWorkflow } from "./types";
import { message } from "./api";
import { deadlineLabel } from "./deadlines";
import { DatePicker } from "./DatePicker";
import { taskDuration } from "./taskTiming";
import { BottomSheet } from "./BottomSheet";
export function TaskEditor({
  task,
  onSave,
  onClose,
  workflow,
  onAppendStep,
  onDeleteStep,
  focusChain = false,
}: {
  task?: Task;
  focusChain?: boolean;
  workflow?: TaskWorkflow;
  onAppendStep?: (content: string) => Promise<unknown>;
  onDeleteStep?: (stepId: string) => Promise<unknown>;
  onSave: (input: TaskInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const initial = task
    ? task.description
      ? task.description.startsWith(task.title)
        ? task.description
        : `${task.title}\n\n${task.description}`
      : task.title
    : "";
  const [text, setText] = useState(initial);
  const [priority, setPriority] = useState<Task["priority"]>(
    task?.priority ?? "med",
  );
  const [category, setCategory] = useState<Task["category"]>(task?.category ?? null);
  const [date, setDate] = useState(task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? null);
  const [composerOpen, setComposerOpen] = useState(focusChain);
  const [stepText, setStepText] = useState("");
  const [deletingStep, setDeletingStep] = useState<string | null>(null);
  const [appending, setAppending] = useState(false);
  const [stepError, setStepError] = useState("");
  const canAppend = !!task && task.status !== "completed" && (workflow?.state === "working" || workflow?.state === "waiting") && !!onAppendStep;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [choosingDate, setChoosingDate] = useState(false);
  const dateButton = useRef<HTMLButtonElement>(null);
  const wasChoosing = useRef(false);
  useEffect(() => {
    if (!choosingDate && wasChoosing.current) dateButton.current?.focus();
    wasChoosing.current = choosingDate;
  }, [choosingDate]);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const stepInput = useRef<HTMLTextAreaElement>(null);
  const progressToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (composerOpen) stepInput.current?.focus();
  }, [composerOpen]);
  useLayoutEffect(() => {
    const input = contentInput.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      const style = getComputedStyle(input);
      const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      input.style.height = `${Math.ceil(input.scrollHeight + border)}px`;
      input.scrollTop = 0;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [text, choosingDate]);
  async function appendStep() {
    const content = stepText.trim();
    if (!content || appending || deletingStep || !onAppendStep) return;
    setAppending(true);
    setStepError("");
    try {
      await onAppendStep(content);
      setStepText("");
      setComposerOpen(false);
      progressToggle.current?.focus();
    } catch (e) {
      setStepError(message(e));
    } finally {
      setAppending(false);
    }
  }
  async function deleteStep(stepId: string) {
    if (!onDeleteStep || deletingStep || saving || appending) return;
    setDeletingStep(stepId);
    setStepError("");
    try { await onDeleteStep(stepId); }
    catch (e) { setStepError(message(e)); }
    finally { setDeletingStep(null); }
  }
  async function saveTask(selectedDate = date, selectedTime = dueTime) {
    const content = text.trim();
    if (!content || saving || appending || deletingStep) return;
    setSaving(true);
    setError("");
    const title = Array.from(content.split(/\r?\n/)[0]).slice(0, 200).join("");
    try {
      await onSave({
        id: task?.id,
        title,
        description: content === title ? "" : content,
        priority,
        category,
        dueDate: selectedDate || null,
        dueTime: selectedDate ? selectedTime : null,
        status: task?.status ?? "todo",
      });
      onClose();
    } catch (e) {
      setChoosingDate(false);
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  return (<>
    <form className="editor" aria-hidden={choosingDate||undefined} onSubmit={e => { e.preventDefault(); void saveTask(); }}>
      <div className="section-heading">
        <h2>{task ? "编辑任务" : "记下一件事"}</h2>
        <button
          type="button"
          className="text-button icon-text"
          onClick={onClose}
        >
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
      <div className="editor-scroll">
      <label className="task-content-label">
        任务内容
        <textarea
          ref={contentInput}
          className="task-input"
          aria-label="任务内容"
          autoFocus={!focusChain}
          maxLength={10000}
          rows={2}
          placeholder="写下要做的事，一段话就够了…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
      </label>
      <div className="field-row task-details">
        <div className="date-field">
          <span className="field-caption">截止时间</span>
          <button type="button" ref={dateButton} className={`date-trigger ${date ? "has-date" : ""}`} aria-label={date ? `截止时间：${deadlineLabel(date, dueTime)}` : "选择截止时间"} onClick={() => setChoosingDate(true)}>
            <CalendarBlank size={18} /><span>{date ? deadlineLabel(date, dueTime) : "安排到周几"}</span><CaretRight size={14} />
          </button>
        </div>
        <fieldset className="priority-field">
          <legend>优先级</legend>
          <div
            role="radiogroup"
            aria-label="优先级"
            className="priority-options"
          >
            {(
              [
                { value: "high", label: "高" },
                { value: "med", label: "中" },
                { value: "low", label: "低" },
              ] as const
            ).map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-label={`${p.label}优先级`}
                aria-checked={priority === p.value}
                className={`priority-option priority-${p.value} ${priority === p.value ? "selected" : ""}`}
                onClick={() => setPriority(p.value)}
              >
                <i />
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="task-label-field"><span>任务标签</span><div className="label-options" role="radiogroup" aria-label="任务标签">{([['work','工作'],['life','生活']] as const).map(([value,label])=><button type="button" key={value} role="radio" aria-label={`${label}标签`} aria-checked={category===value} onClick={()=>setCategory(category===value?null:value)}>{label}</button>)}</div></div>
      {workflow && (workflow.steps.length > 0 || canAppend) && <section className="task-chain" aria-label="跟进记录">
        <div className="followup-toolbar"><h3>跟进记录{workflow.steps.length ? ` · ${workflow.steps.length}条` : ""}</h3>
        {canAppend && <button ref={progressToggle} type="button" className="secondary icon-text progress-toggle" aria-expanded={composerOpen} aria-controls="progress-composer" disabled={appending || saving || !!deletingStep} onClick={()=>setComposerOpen(!composerOpen)}>{composerOpen ? <CaretUp size={15}/> : <Plus size={15}/>}{composerOpen ? "收起输入" : "记录进展"}</button>}</div>
        {canAppend && composerOpen && <div className="step-composer" id="progress-composer">
          <label>本次进展<textarea ref={stepInput} aria-label="本次进展" rows={3} maxLength={2000} value={stepText} disabled={appending || saving || !!deletingStep} onChange={e => setStepText(e.target.value)} placeholder="记录这次的进展、沟通结果或下一步安排…" /></label>
          <button type="button" className="primary add-step icon-text" disabled={appending || saving || !!deletingStep || !stepText.trim()} onClick={() => void appendStep()}><Plus size={17}/>{appending ? "正在记录…" : "记录进展"}</button>
        </div>}
        {workflow.steps.length > 0 && <ol>{workflow.steps.map((step, index) => <li key={step.id}>
          <div className="followup-heading"><time dateTime={step.createdAt}>{new Date(step.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
          {onDeleteStep && <button type="button" className="step-delete" aria-label={`删除跟进记录 ${index + 1}`} title="删除这条跟进记录" disabled={!!deletingStep || saving || appending} onClick={() => void deleteStep(step.id)}><Trash size={16}/></button>}</div>
          <p>{step.content}</p>
        </li>)}</ol>}
        {stepError && <p className="error" role="alert">{stepError}</p>}
      </section>}
      {task && <dl className="task-timing" aria-label="任务时间记录">
        <div><dt>开始时间</dt><dd>{task.startedAt ? new Date(task.startedAt).toLocaleString("zh-CN", { hour12: false }) : "未记录"}</dd></div>
        <div><dt>完成时间</dt><dd>{task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN", { hour12: false }) : "尚未完成"}</dd></div>
        <div><dt>{task.completedAt ? "任务用时" : "已用时"}</dt><dd>{taskDuration(task)}</dd></div>
      </dl>}
      {!!task?.activityLog?.length && <details className="task-history" aria-label="任务状态记录">
        <summary>状态记录 · {task.activityLog.length}次</summary>
        <ol>{task.activityLog.map(event => <li key={event.id}>
          <span>{({started:"开始做",paused:"暂停",resumed:"继续做",completed:"完成",reopened:"恢复为待办"})[event.action]}</span>
          <time dateTime={event.at}>{new Date(event.at).toLocaleString("zh-CN", {hour12:false})}</time>
        </li>)}</ol>
      </details>}
      </div>
      <div className="editor-save-bar">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="primary save icon-text"
        disabled={saving || appending || !!deletingStep || !text.trim()}
      >
        <Check size={19} />
        {saving ? "正在保存…" : "保存任务"}
      </button>
      </div>
    </form>
      {choosingDate && <BottomSheet title="选择截止时间" onClose={()=>setChoosingDate(false)}><DatePicker value={date} time={dueTime} saving={saving} canSave={!!text.trim() && !appending && !deletingStep} onSave={(selectedDate,selectedTime)=>{setDate(selectedDate);setDueTime(selectedTime);void saveTask(selectedDate,selectedTime);}} onClose={()=>setChoosingDate(false)} onChange={(date,time)=>{setDate(date);setDueTime(time);setChoosingDate(false);}}/></BottomSheet>}
  </>);
}
