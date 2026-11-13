use crate::store::Snapshot;
use chrono::{DateTime, Local};

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
    let headers = ["任务ID", "任务标题", "任务说明", "优先级", "状态", "创建时间", "更新时间", "计划完成日期", "计划完成时段", "计划完成时间", "实际完成时间", "是否当前任务"];
    let mut csv = format!("\u{feff}{}\r\n", headers.map(cell).join(","));
    for task in &snapshot.tasks {
        let date = task.due_date.as_deref().unwrap_or("");
        let time = task.due_time.as_deref().unwrap_or("");
        let planned = if time.is_empty() { date.into() } else { format!("{date} {time}") };
        let values = [
            task.id.clone(), task.title.clone(), task.description.clone(),
            match task.priority.as_str() { "high" => "高", "low" => "低", _ => "中" }.into(),
            if task.status == "completed" { "已完成" } else { "待办" }.into(),
            local_time(&task.created_at), local_time(&task.updated_at),
            date.into(), time.into(), planned,
            task.completed_at.as_deref().map(local_time).unwrap_or_default(),
            if snapshot.settings.focus_id.as_deref() == Some(&task.id) { "是" } else { "否" }.into(),
        ];
        csv.push_str(&values.iter().map(|value| cell(value)).collect::<Vec<_>>().join(","));
        csv.push_str("\r\n");
    }
    csv
}
