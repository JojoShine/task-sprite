use chrono::{DateTime, FixedOffset, NaiveDate, NaiveTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

pub type Result<T> = std::result::Result<T, String>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskInput {
    pub id: Option<String>,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub pet: String,
    pub focus_id: Option<String>,
    pub notifications: bool,
    pub summary_time: String,
    pub quiet_start: String,
    pub quiet_end: String,
    pub reduce_motion: bool,
    pub show_hint: bool,
    pub pet_x: Option<f64>,
    pub pet_y: Option<f64>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            pet: "shiba".into(),
            focus_id: None,
            notifications: true,
            summary_time: "09:00".into(),
            quiet_start: "23:00".into(),
            quiet_end: "08:00".into(),
            reduce_motion: false,
            show_hint: true,
            pet_x: None,
            pet_y: None,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub tasks: Vec<Task>,
    pub settings: Settings,
}
pub struct Store {
    pub conn: Connection,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let existed = path.exists();
        let conn = Connection::open(path).map_err(err)?;
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(err)?;
        if version > 1 {
            return Err("数据版本高于当前应用，请使用新版应用打开".into());
        }
        if version == 0 && existed {
            let mut backup = Connection::open(
                path.with_extension(format!("backup-{}.db", Utc::now().timestamp_millis())),
            )
            .map_err(err)?;
            rusqlite::backup::Backup::new(&conn, &mut backup)
                .map_err(err)?
                .run_to_completion(32, Duration::from_millis(10), None)
                .map_err(err)?;
        }
        Self::initialize(conn)
    }
    #[cfg(test)]
    pub fn memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory().map_err(err)?)
    }
    fn initialize(conn: Connection) -> Result<Self> {
        conn.busy_timeout(Duration::from_secs(3)).map_err(err)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; BEGIN; CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS snoozes(task_id TEXT PRIMARY KEY REFERENCES tasks(id),at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS delivered(day TEXT PRIMARY KEY); PRAGMA user_version=1; COMMIT;").map_err(err)?;
        conn.execute(
            "INSERT OR IGNORE INTO settings VALUES(1,?1)",
            [serde_json::to_string(&Settings::default()).map_err(err)?],
        )
        .map_err(err)?;
        Ok(Self { conn })
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut q=self.conn.prepare("SELECT id,title,description,priority,status,due_date,created_at,updated_at,completed_at FROM tasks ORDER BY created_at DESC,id").map_err(err)?;
        let tasks = q
            .query_map([], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    description: r.get(2)?,
                    priority: r.get(3)?,
                    status: r.get(4)?,
                    due_date: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                    completed_at: r.get(8)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let raw: String = self
            .conn
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
            .map_err(err)?;
        Ok(Snapshot {
            tasks,
            settings: serde_json::from_str(&raw).map_err(err)?,
        })
    }
    pub fn save_task(&mut self, i: TaskInput) -> Result<Task> {
        let title = i.title.trim();
        if title.is_empty() || title.chars().count() > 200 {
            return Err("任务名称需要 1–200 个字".into());
        }
        if i.description.chars().count() > 10000 {
            return Err("任务描述过长".into());
        }
        if !["high", "med", "low"].contains(&i.priority.as_str())
            || !["todo", "completed"].contains(&i.status.as_str())
        {
            return Err("任务状态或优先级无效".into());
        }
        if let Some(d) = &i.due_date {
            if d.len() != 10 || NaiveDate::parse_from_str(d, "%Y-%m-%d").is_err() {
                return Err("截止日期无效".into());
            }
        }
        let snapshot = self.snapshot()?;
        let old = if let Some(id) = &i.id {
            Some(
                snapshot
                    .tasks
                    .iter()
                    .find(|t| &t.id == id)
                    .ok_or("任务不存在")?,
            )
        } else {
            None
        };
        let now = Utc::now().to_rfc3339();
        let t = Task {
            id: i
                .id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            title: title.into(),
            description: i.description,
            priority: i.priority,
            status: i.status.clone(),
            due_date: i.due_date,
            created_at: old.map(|t| t.created_at.clone()).unwrap_or(now.clone()),
            updated_at: now.clone(),
            completed_at: if i.status == "completed" {
                Some(old.and_then(|t| t.completed_at.clone()).unwrap_or(now))
            } else {
                None
            },
        };
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("INSERT INTO tasks VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,priority=excluded.priority,status=excluded.status,due_date=excluded.due_date,updated_at=excluded.updated_at,completed_at=excluded.completed_at",params![t.id,t.title,t.description,t.priority,t.status,t.due_date,t.created_at,t.updated_at,t.completed_at]).map_err(err)?;
        if t.status == "completed" {
            tx.execute("DELETE FROM snoozes WHERE task_id=?1", [&t.id])
                .map_err(err)?;
            let mut st = snapshot.settings;
            if st.focus_id.as_deref() == Some(&t.id) {
                st.focus_id = None;
                tx.execute(
                    "UPDATE settings SET payload=?1 WHERE id=1",
                    [serde_json::to_string(&st).map_err(err)?],
                )
                .map_err(err)?;
            }
        }
        tx.commit().map_err(err)?;
        Ok(t)
    }
    pub fn set_settings(&mut self, s: Settings) -> Result<()> {
        if !["cat", "shiba", "robot", "ghost"].contains(&s.pet.as_str()) {
            return Err("请选择内置伙伴".into());
        }
        for t in [&s.summary_time, &s.quiet_start, &s.quiet_end] {
            if t.len() != 5 || NaiveTime::parse_from_str(t, "%H:%M").is_err() {
                return Err("提醒时间无效".into());
            }
        }
        if s.pet_x.is_some_and(|x| !x.is_finite()) || s.pet_y.is_some_and(|y| !y.is_finite()) {
            return Err("窗口位置无效".into());
        }
        if let Some(id) = &s.focus_id {
            if !self
                .snapshot()?
                .tasks
                .iter()
                .any(|t| &t.id == id && t.status == "todo")
            {
                return Err("只能专注于待办任务".into());
            }
        }
        self.conn
            .execute(
                "UPDATE settings SET payload=?1 WHERE id=1",
                [serde_json::to_string(&s).map_err(err)?],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn set_focus(&mut self, id: Option<String>) -> Result<()> {
        let mut s = self.snapshot()?.settings;
        s.focus_id = id;
        self.set_settings(s)
    }
    pub fn snooze(&mut self, id: &str, minutes: i64, now: DateTime<FixedOffset>) -> Result<()> {
        if minutes != 30 && minutes != 120 {
            return Err("稍后提醒仅支持30分钟或2小时".into());
        }
        if !self
            .snapshot()?
            .tasks
            .iter()
            .any(|t| t.id == id && t.status == "todo")
        {
            return Err("待办任务不存在".into());
        }
        let at = now.with_timezone(&Utc) + chrono::Duration::minutes(minutes);
        self.conn.execute("INSERT INTO snoozes VALUES(?1,?2) ON CONFLICT(task_id) DO UPDATE SET at=excluded.at",params![id,at.to_rfc3339()]).map_err(err)?;
        Ok(())
    }
    pub fn snoozes(&self) -> Result<Vec<(String, DateTime<Utc>)>> {
        let mut q = self
            .conn
            .prepare("SELECT task_id,at FROM snoozes")
            .map_err(err)?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        rows.into_iter()
            .map(|(id, at)| {
                Ok((
                    id,
                    DateTime::parse_from_rfc3339(&at)
                        .map_err(err)?
                        .with_timezone(&Utc),
                ))
            })
            .collect()
    }
    pub fn delivered(&self, day: &str) -> Result<bool> {
        self.conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM delivered WHERE day=?1)",
                [day],
                |r| r.get(0),
            )
            .map_err(err)
    }
    pub fn record_delivery(&mut self, n: &crate::reminders::Notice) -> Result<()> {
        let tx = self.conn.transaction().map_err(err)?;
        if let Some(day) = &n.summary_day {
            tx.execute("INSERT OR IGNORE INTO delivered VALUES(?1)", [day])
                .map_err(err)?;
        }
        for id in &n.snoozed_ids {
            tx.execute("DELETE FROM snoozes WHERE task_id=?1", [id])
                .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(())
    }
}
