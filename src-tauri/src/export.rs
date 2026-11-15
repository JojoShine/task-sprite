use crate::store::Snapshot;
#[path = "working_time.rs"]
mod working_time;
use chrono::{DateTime, Local, Utc};

fn cell(value: &str) -> String {
    let formula = value.trim_start().starts_with(['=', '+', '-', '@'])
        || value.starts_with(['\t', '\r', '\n']);
    format!("\"{}{}\"", if formula { "'" } else { "" }, value.replace('"', "\"\""))
}
fn local_time(value: &str) -> String {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S %:z").to_string())
        .unwrap_or_else(|_| value.into())
}
pub fn tasks_csv(snapshot: &Snapshot) -> String {
    let headers = ["任务ID", "任务标题", "任务说明", "优先级", "状态", "创建时间", "更新时间", "计划完成日期", "计划完成时段", "计划完成时间", "开始时间", "实际完成时间", "任务用时（分钟）", "任务用时（时:分）", "任务标签", "是否当前任务", "任务活动历史"];
    let mut csv = format!("\u{feff}{}\r\n", headers.map(cell).join(","));
    for task in &snapshot.tasks {
        let date = task.due_date.as_deref().unwrap_or("");
        let time = task.due_time.as_deref().unwrap_or("");
        let planned = if time.is_empty() { date.into() } else { format!("{date} {time}") };
        let elapsed = elapsed_seconds(task, Utc::now());
        let values = [
            task.id.clone(), task.title.clone(), task.description.clone(),
            match task.priority.as_str() { "high" => "高", "low" => "低", _ => "中" }.into(),
            if task.status == "completed" { "已完成" } else { "待办" }.into(),
            local_time(&task.created_at), local_time(&task.updated_at),
            date.into(), time.into(), planned,
            task.started_at.as_deref().map(local_time).unwrap_or_default(),
            task.completed_at.as_deref().map(local_time).unwrap_or_default(),
            elapsed.map(|seconds| (seconds / 60).to_string()).unwrap_or_default(),
            elapsed.map(|seconds| format!("{:02}:{:02}", seconds / 3600, seconds / 60 % 60)).unwrap_or_default(),
            match task.category.as_deref() {Some("work")=>"工作",Some("life")=>"生活",_=>""}.into(),
            if snapshot.settings.focus_id.as_deref() == Some(&task.id) { "是" } else { "否" }.into(),
            serde_json::to_string(&task.activity_log).unwrap_or_default(),
        ];
        csv.push_str(&values.iter().map(|value| cell(value)).collect::<Vec<_>>().join(","));
        csv.push_str("\r\n");
    }
    csv
}

fn elapsed_seconds(task: &crate::store::Task, now: DateTime<Utc>) -> Option<i64> {
    if task.activity_log.is_empty() {
        return task.started_at.as_deref().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|start| {
            let end = task.completed_at.as_deref().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|t|t.with_timezone(&Utc)).unwrap_or(now);
            working_time::milliseconds(start.with_timezone(&Utc), end) / 1000
        });
    }
    let mut start = None;
    let mut intervals = Vec::new();
    let mut timed = false;
    for event in &task.activity_log {
        let Ok(at) = DateTime::parse_from_rfc3339(&event.at) else {continue;};
        let at = at.with_timezone(&Utc);
        match event.action.as_str() {
            "started" | "resumed" => {if start.is_none() {start=Some(at);} timed=true;},
            "paused" | "completed" | "reopened" => {if let Some(begin)=start.take() {intervals.push((begin, at));}},
            _ => {},
        }
    }
    if let Some(begin)=start {
        let end=task.completed_at.as_deref().and_then(|s|DateTime::parse_from_rfc3339(s).ok()).map(|t|t.with_timezone(&Utc)).unwrap_or(now);
        intervals.push((begin, end));
    }
    timed.then(|| working_time::active_milliseconds(intervals) / 1000)
}

#[cfg(test)]
mod timing_tests {
    use super::*;
    use crate::store::Task;
    fn timed(start: &str, end: &str) -> Task {
        serde_json::from_value(serde_json::json!({"id":"timing-fixture","title":"fixture","description":"","priority":"med","status":"completed","createdAt":start,"updatedAt":end,"startedAt":start,"completedAt":end,"dueDate":null})).unwrap()
    }
    #[test]
    fn working_windows_cover_full_day_lunch_overnight_and_cross_day() {
        for (start,end,minutes) in [
            ("2026-11-14T08:00:00+08:00","2026-11-14T18:30:00+08:00",450),
            ("2026-11-14T11:50:00+08:00","2026-11-14T14:10:00+08:00",20),
            ("2026-11-14T18:00:00+08:00","2026-11-15T08:30:00+08:00",0),
            ("2026-11-14T17:50:00+08:00","2026-11-15T08:40:00+08:00",20),
            ("2026-11-14T10:00:00+08:00","2026-11-14T09:00:00+08:00",0),
        ] {
            assert_eq!(elapsed_seconds(&timed(start,end), Utc::now()).map(|seconds|seconds/60),Some(minutes));
        }
    }
    #[test]
    fn csv_aggregates_fractional_active_intervals_and_preserves_raw_history() {
        let mut task=timed("2026-11-14T09:00:00.100+08:00","2026-11-14T09:02:30.650+08:00");
        task.activity_log=serde_json::from_value(serde_json::json!([
            {"id":"a","action":"started","at":task.started_at},
            {"id":"b","action":"paused","at":"2026-11-14T09:00:29.700+08:00"},
            {"id":"c","action":"resumed","at":"2026-11-14T09:02:00.150+08:00"},
            {"id":"d","action":"completed","at":task.completed_at}
        ])).unwrap();
        assert_eq!(elapsed_seconds(&task,Utc::now()).map(|seconds|seconds/60),Some(1));
        let raw=serde_json::to_string(&task).unwrap();
        let mut snapshot=crate::store::Store::memory().unwrap().snapshot().unwrap();
        snapshot.tasks.push(task);
        let csv=tasks_csv(&snapshot);
        assert!(csv.contains("任务用时（分钟）"));
        assert!(csv.contains("任务用时（时:分）"));
        assert!(csv.contains("\"1\",\"00:01\""));
        assert!(csv.contains("09:00:29.700+08:00"));
        assert_eq!(serde_json::to_string(&snapshot.tasks[0]).unwrap(),raw);
    }
    #[test]
    fn rollback_intervals_are_unioned_without_rewriting_history() {
        for (first,pause,resume,end,minutes) in [
            ("08:30:00","12:00:00","08:30:00","18:00:00",450),
            ("09:00:00","10:00:00","09:30:00","10:30:00",90),
            ("09:00:00","10:00:00","09:15:00","09:45:00",60),
        ] {
            let at=|time| format!("2026-11-14T{time}+08:00");
            let mut task=timed(&at(first),&at(end));
            task.activity_log=serde_json::from_value(serde_json::json!([
                {"id":"a","action":"started","at":at(first)},
                {"id":"b","action":"paused","at":at(pause)},
                {"id":"c","action":"resumed","at":at(resume)},
                {"id":"d","action":"completed","at":at(end)},
            ])).unwrap();
            let raw=serde_json::to_string(&task).unwrap();
            assert_eq!(elapsed_seconds(&task,Utc::now()),Some(minutes*60));
            let mut snapshot=crate::store::Store::memory().unwrap().snapshot().unwrap();
            snapshot.tasks.push(task);
            assert!(tasks_csv(&snapshot).contains(&format!("\"{minutes}\",\"{:02}:{:02}\"",minutes/60,minutes%60)));
            assert_eq!(serde_json::to_string(&snapshot.tasks[0]).unwrap(),raw);
        }
    }

}
