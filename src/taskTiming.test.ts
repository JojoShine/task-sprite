import { expect, it } from "vitest";
import { taskDuration } from "./taskTiming";
it("uses the saved completion time and keeps ongoing elapsed time across restarts", () => {
  const task = { startedAt: "2026-11-13T01:00:00Z", completedAt: "2026-11-13T02:02:03Z" };
  expect(taskDuration(task, Date.parse("2026-11-14T01:00:00Z"))).toBe("1小时2分");
  expect(taskDuration({ ...task, completedAt: null }, Date.parse("2026-11-13T01:01:05Z"))).toBe("1分");
});
it("leaves unknown starts unrecorded and never shows a negative duration", () => {
  expect(taskDuration({ startedAt: null, completedAt: "2026-11-13T01:00:00Z" })).toBe("未记录");
  expect(taskDuration({ startedAt: "2026-11-13T02:00:00Z", completedAt: "2026-11-13T01:00:00Z" })).toBe("0分");
});

it("counts only active intervals across pause, resume, completion and reopen", () => {
  const task={startedAt:"2026-11-14T01:00:00Z",completedAt:"2026-11-14T04:30:00Z",activityLog:[
    {id:"1",action:"started" as const,at:"2026-11-14T01:00:00Z"},
    {id:"2",action:"paused" as const,at:"2026-11-14T01:10:00Z"},
    {id:"3",action:"resumed" as const,at:"2026-11-14T02:00:00Z"},
    {id:"4",action:"completed" as const,at:"2026-11-14T02:05:00Z"},
    {id:"5",action:"reopened" as const,at:"2026-11-14T03:00:00Z"},
    {id:"6",action:"resumed" as const,at:"2026-11-14T04:00:00Z"},
    {id:"7",action:"completed" as const,at:"2026-11-14T04:30:00Z"},
  ]};
  expect(taskDuration(task)).toBe("15分");
  expect(taskDuration({...task,completedAt:null,activityLog:task.activityLog.slice(0,2)},Date.parse("2026-11-15T00:00:00Z"))).toBe("10分");
});

it("does not invent elapsed time for a completion that was never started", () => {
  expect(taskDuration({startedAt:null,completedAt:"2026-11-14T01:00:00Z",activityLog:[{id:"completion",action:"completed",at:"2026-11-14T01:00:00Z"}]})).toBe("未记录");
});

const beijing = (value: string) => `2026-11-14T${value}+08:00`;
it.each([
  ["08:00:00", "18:30:00", "7小时30分"],
  ["11:50:00", "14:10:00", "20分"],
  ["12:00:00", "14:00:00", "0分"],
])("clips %s–%s to Beijing working windows", (start, end, expected) => {
  expect(taskDuration({startedAt: beijing(start), completedAt: beijing(end)})).toBe(expected);
});
it("excludes overnight time and adds working windows across calendar days", () => {
  expect(taskDuration({startedAt: beijing("18:00:00"), completedAt: "2026-11-15T08:30:00+08:00"})).toBe("0分");
  expect(taskDuration({startedAt: beijing("17:50:00"), completedAt: "2026-11-15T08:40:00+08:00"})).toBe("20分");
});
it("aggregates fractional seconds across pauses before rounding to minutes without changing history", () => {
  const task = {startedAt: beijing("09:00:00.100"), completedAt: beijing("09:02:30.650"), activityLog: [
    {id:"a",action:"started" as const,at:beijing("09:00:00.100")},
    {id:"b",action:"paused" as const,at:beijing("09:00:29.700")},
    {id:"c",action:"resumed" as const,at:beijing("09:02:00.150")},
    {id:"d",action:"completed" as const,at:beijing("09:02:30.650")},
  ]};
  const raw = JSON.stringify(task);
  expect(taskDuration(task)).toBe("1分");
  expect(JSON.stringify(task)).toBe(raw);
});
it("keeps subminute and malformed legacy durations at zero minutes", () => {
  expect(taskDuration({startedAt:beijing("09:00:00"),completedAt:beijing("09:00:59")})).toBe("0分");
  expect(taskDuration({startedAt:"invalid",completedAt:beijing("09:10:00")})).toBe("0分");
});

it.each([
  ["08:30:00", "12:00:00", "08:30:00", "18:00:00", "7小时30分"],
  ["09:00:00", "10:00:00", "09:30:00", "10:30:00", "1小时30分"],
  ["09:00:00", "10:00:00", "09:15:00", "09:45:00", "1小时"],
])("unions rollback activity %s–%s and %s–%s before clipping", (first, pause, resume, end, expected) => {
  const task = {startedAt:beijing(first),completedAt:beijing(end),activityLog:[
    {id:"a",action:"started" as const,at:beijing(first)},
    {id:"b",action:"paused" as const,at:beijing(pause)},
    {id:"c",action:"resumed" as const,at:beijing(resume)},
    {id:"d",action:"completed" as const,at:beijing(end)},
  ]};
  const raw=JSON.stringify(task);
  expect(taskDuration(task)).toBe(expected);
  expect(JSON.stringify(task)).toBe(raw);
});
