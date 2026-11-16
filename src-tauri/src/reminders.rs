use crate::store::{Result, Store};
use chrono::{DateTime, FixedOffset, NaiveDateTime, NaiveTime, Timelike};
use std::collections::BTreeSet;
#[derive(Debug)]
pub struct Notice {
    pub task_ids: Vec<String>,
    pub summary_day: Option<String>,
    pub snoozed_ids: Vec<String>,
    pub deadlines: Vec<(String, String)>,
    pub body: String,
}
pub fn is_quiet(now: u32, start: u32, end: u32) -> bool {
    if start == end {
        false
    } else if start < end {
        now >= start && now < end
    } else {
        now >= start || now < end
    }
}
fn minutes(s: &str) -> u32 {
    let t = NaiveTime::parse_from_str(s, "%H:%M").expect("validated settings time");
    t.hour() * 60 + t.minute()
}
pub fn plan(s: &Store, now: DateTime<FixedOffset>) -> Result<Option<Notice>> {
    let snap = s.snapshot()?;
    let st = snap.settings;
    let m = now.hour() * 60 + now.minute();
    if !st.notifications || is_quiet(m, minutes(&st.quiet_start), minutes(&st.quiet_end)) {
        return Ok(None);
    }
    let today = now.date_naive().to_string();
    let todos: Vec<_> = snap.tasks.iter().filter(|t| t.status == "todo").collect();
    let snoozes = s.snoozes()?;
    let snoozed_ids: Vec<_> = snoozes
        .iter()
        .filter(|(id, at)| *at <= now && todos.iter().any(|t| &t.id == id))
        .map(|(id, _)| id.clone())
        .collect();
    let summary_tasks: Vec<_> = if m >= minutes(&st.summary_time) && !s.delivered(&today)? {
        todos
            .iter()
            .filter(|t| t.due_date.as_ref().is_some_and(|d| d <= &today) && !snoozes.iter().any(|(id, at)| id == &t.id && *at > now))
            .map(|t| t.id.clone())
            .collect()
    } else {
        vec![]
    };
    let summary_day = if summary_tasks.is_empty() {
        None
    } else {
        Some(today.clone())
    };
    let mut deadlines = Vec::new();
    for t in &todos {
        if snoozes.iter().any(|(id, at)| id == &t.id && *at > now) { continue; }
        if let Some(date) = &t.due_date {
            let time = t.due_time.as_deref().unwrap_or("17:00");
            let deadline = NaiveDateTime::parse_from_str(&format!("{date}T{time}"), "%Y-%m-%dT%H:%M")
                .map_err(|e| e.to_string())?;
            let elapsed = now.naive_local().signed_duration_since(deadline - chrono::Duration::hours(2));
            if elapsed.num_seconds() < 0 { continue; }
            // One durable key per scheduled half-hour slot, including overdue slots.
            let key = format!("{date}T{time}/{}", elapsed.num_seconds() / 1800);
            if !s.deadline_delivered(&t.id, &key)? {
                deadlines.push((t.id.clone(), key));
            }
        }
    }
    let task_ids: Vec<_> = summary_tasks
        .into_iter()
        .chain(snoozed_ids.iter().cloned())
        .chain(deadlines.iter().map(|(id, _)| id.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if task_ids.is_empty() {
        return Ok(None);
    }
    let names: Vec<_> = task_ids
        .iter()
        .filter_map(|id| todos.iter().find(|t| &t.id == id).map(|t| t.title.clone()))
        .take(3)
        .collect();
    let body = format!("有 {} 项任务需要关注：{}", task_ids.len(), names.join("、"));
    Ok(Some(Notice {
        task_ids,
        summary_day,
        snoozed_ids,
        deadlines,
        body,
    }))
}

pub fn deliver(
    s: &mut Store,
    now: DateTime<FixedOffset>,
    send: impl FnOnce(&Notice) -> Result<()>,
) -> Result<bool> {
    let Some(n) = plan(s, now)? else {
        return Ok(false);
    };
    send(&n)?;
    s.record_delivery(&n)?;
    Ok(true)
}
