use chrono::{DateTime, FixedOffset, NaiveDate, NaiveTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub id: String,
    pub action: String,
    pub at: String,
}
impl ActivityEvent {
    pub fn new(action: &str, at: &str) -> Self {
        Self { id: uuid::Uuid::new_v4().to_string(), action: action.into(), at: at.into() }
    }
}

pub type Result<T> = std::result::Result<T, String>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub category: Option<String>,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
    #[serde(default)]
    pub due_time: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub activity_log: Vec<ActivityEvent>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskInput {
    pub id: Option<String>,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub category: Option<String>,
    pub priority: String,
    pub status: String,
    pub due_date: Option<String>,
    #[serde(default)]
    pub due_time: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub pet: String,
    #[serde(default = "default_skin")]
    pub skin: String,
    pub focus_id: Option<String>,
    pub notifications: bool,
    pub summary_time: String,
    pub quiet_start: String,
    pub quiet_end: String,
    pub reduce_motion: bool,
    pub show_hint: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    pub pet_x: Option<f64>,
    pub pet_y: Option<f64>,
}
fn default_skin() -> String { "default".into() }
fn default_theme() -> String {
    "system".into()
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            pet: "shiba".into(),
            skin: default_skin(),
            focus_id: None,
            notifications: true,
            summary_time: "09:00".into(),
            quiet_start: "23:00".into(),
            quiet_end: "08:00".into(),
            reduce_motion: false,
            show_hint: true,
            theme: default_theme(),
            pet_x: None,
            pet_y: None,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct Snapshot {
    #[serde(rename = "looksExpiresAt")]
    pub looks_expires_at: Option<String>,
    pub tasks: Vec<Task>,
    pub settings: Settings,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIdentity {
    pub user_id: String,
    pub created_at: String,
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
        if version > 5 {
            return Err("数据版本高于当前应用，请使用新版应用打开".into());
        }
        if version < 5 && existed {
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
    fn initialize(mut conn: Connection) -> Result<Self> {
        conn.busy_timeout(Duration::from_secs(3)).map_err(err)?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(err)?;
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(err)?;
        let tx = conn.transaction().map_err(err)?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,due_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS snoozes(task_id TEXT PRIMARY KEY REFERENCES tasks(id),at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS delivered(day TEXT PRIMARY KEY);").map_err(err)?;
        if version < 2 {
            tx.execute_batch("ALTER TABLE tasks ADD COLUMN due_time TEXT;")
                .map_err(err)?;
        }
        if version < 3 {
            tx.execute_batch("ALTER TABLE tasks ADD COLUMN started_at TEXT;").map_err(err)?;
        }
        if version < 4 { tx.execute_batch("ALTER TABLE tasks ADD COLUMN category TEXT;").map_err(err)?; }
        if version < 5 { tx.execute_batch("ALTER TABLE tasks ADD COLUMN activity_log TEXT NOT NULL DEFAULT '[]';").map_err(err)?; }
        tx.execute_batch("CREATE TABLE IF NOT EXISTS local_identity(id INTEGER PRIMARY KEY CHECK(id=1),user_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS deadline_delivered(task_id TEXT NOT NULL REFERENCES tasks(id),deadline TEXT NOT NULL,PRIMARY KEY(task_id,deadline));").map_err(err)?;
        tx.execute(
            "INSERT OR IGNORE INTO settings VALUES(1,?1)",
            [serde_json::to_string(&Settings::default()).map_err(err)?],
        )
        .map_err(err)?;
        tx.execute(
            "INSERT OR IGNORE INTO local_identity VALUES(1,?1,?2)",
            params![uuid::Uuid::new_v4().to_string(), Utc::now().to_rfc3339()],
        )
        .map_err(err)?;
        tx.pragma_update(None, "user_version", 5).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(Self { conn })
    }
    pub fn local_identity(&self) -> Result<LocalIdentity> {
        self.conn
            .query_row(
                "SELECT user_id,created_at FROM local_identity WHERE id=1",
                [],
                |r| {
                    Ok(LocalIdentity {
                        user_id: r.get(0)?,
                        created_at: r.get(1)?,
                    })
                },
            )
            .map_err(err)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let mut q=self.conn.prepare("SELECT id,title,description,priority,status,due_date,created_at,updated_at,completed_at,due_time,started_at,category,activity_log FROM tasks ORDER BY created_at DESC,id").map_err(err)?;
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
                    due_time: r.get(9)?,
                    started_at: r.get(10)?,
                    category: r.get(11)?,
                    activity_log: serde_json::from_str(&r.get::<_,String>(12)?).map_err(|e|rusqlite::Error::FromSqlConversionFailure(12,rusqlite::types::Type::Text,Box::new(e)))?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let raw: String = self
            .conn
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
            .map_err(err)?;
        let settings: Settings = serde_json::from_str(&raw).map_err(err)?;
        Ok(Snapshot {
            looks_expires_at: self.looks_expires_at()?,
            tasks,
            settings,
        })
    }
    pub fn save_task(&mut self, i: TaskInput) -> Result<Task> {
        validate_task(&i)?;
        let title = i.title.trim();
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
        let mut activity_log = old.map(|t| t.activity_log.clone()).unwrap_or_default();
        if old.map(|t|t.status.as_str()) != Some(i.status.as_str()) {
            if let Some(task) = old { seed_history(task, &mut activity_log); }
            if i.status == "completed" { activity_log.push(ActivityEvent::new("completed", &now)); }
            else if old.is_some() { activity_log.push(ActivityEvent::new("reopened", &now)); }
        }
        let t = Task {
            id: i
                .id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            title: title.into(),
            description: i.description,
            category: i.category,
            priority: i.priority,
            status: i.status.clone(),
            due_date: i.due_date,
            due_time: i.due_time,
            created_at: old.map(|t| t.created_at.clone()).unwrap_or(now.clone()),
            updated_at: now.clone(),
            started_at: old.and_then(|t| t.started_at.clone()),
            activity_log,
            completed_at: if i.status == "completed" {
                Some(old.and_then(|t| t.completed_at.clone()).unwrap_or(now))
            } else {
                None
            },
        };
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("INSERT INTO tasks(id,title,description,priority,status,due_date,created_at,updated_at,completed_at,due_time,started_at,category,activity_log) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,priority=excluded.priority,status=excluded.status,due_date=excluded.due_date,due_time=excluded.due_time,updated_at=excluded.updated_at,completed_at=excluded.completed_at,started_at=excluded.started_at,category=excluded.category,activity_log=excluded.activity_log",params![t.id,t.title,t.description,t.priority,t.status,t.due_date,t.created_at,t.updated_at,t.completed_at,t.due_time,t.started_at,t.category,serde_json::to_string(&t.activity_log).map_err(err)?]).map_err(err)?;
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
    pub fn save_tasks(&mut self, inputs:Vec<TaskInput>) -> Result<()> {
        if inputs.is_empty() || inputs.len()>30 {return Err("每次请选择1–30项任务".into());}
        for input in &inputs {validate_task(input)?;if input.id.is_some()||input.status!="todo"{return Err("批量添加仅支持新待办任务".into());}}
        let now=Utc::now().to_rfc3339();
        let tx=self.conn.transaction().map_err(err)?;
        for input in inputs {tx.execute("INSERT INTO tasks(id,title,description,priority,status,due_date,due_time,created_at,updated_at,category) VALUES(?1,?2,?3,?4,'todo',?5,?6,?7,?7,?8)",params![uuid::Uuid::new_v4().to_string(),input.title.trim(),input.description,input.priority,input.due_date,input.due_time,now,input.category]).map_err(err)?;}
        tx.commit().map_err(err)
    }
    pub fn delete_task(&mut self, id: &str) -> Result<()> {
        let mut settings = self.snapshot()?.settings;
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("DELETE FROM snoozes WHERE task_id=?1", [id]).map_err(err)?;
        tx.execute("DELETE FROM deadline_delivered WHERE task_id=?1", [id]).map_err(err)?;
        if tx.execute("DELETE FROM tasks WHERE id=?1", [id]).map_err(err)? == 0 {
            return Err("任务不存在".into());
        }
        if settings.focus_id.as_deref() == Some(id) {
            settings.focus_id = None;
            tx.execute("UPDATE settings SET payload=?1 WHERE id=1", [serde_json::to_string(&settings).map_err(err)?]).map_err(err)?;
        }
        tx.commit().map_err(err)
    }
    pub fn set_settings(&mut self, s: Settings) -> Result<()> {
        if !["default", "mint-ghost", "sunset-robot", "snow-shiba", "cream-cat"].contains(&s.skin.as_str()) { return Err("请选择内置皮肤".into()); }
        if self.snapshot()?.settings.skin != s.skin && s.skin != "default" { self.require_look(&s.skin)?; }
        if !["system", "light", "dark"].contains(&s.theme.as_str()) {
            return Err("请选择跟随系统、浅色或深色主题".into());
        }
        if !crate::looks::FREE.contains(&s.pet.as_str()) && !crate::looks::LICENSED.contains(&s.pet.as_str()) {
            return Err("请选择内置伙伴或装扮".into());
        }
        // Preserve an expired selected preference during unrelated local task updates.
        if self.snapshot()?.settings.pet != s.pet { self.require_look(&s.pet)?; }
        for t in [&s.summary_time, &s.quiet_start, &s.quiet_end] {
            if t.len() != 5 || NaiveTime::parse_from_str(t, "%H:%M").is_err() {
                return Err("提醒时间无效".into());
            }
        }
        if s.pet_x.is_some_and(|x| !x.is_finite()) || s.pet_y.is_some_and(|y| !y.is_finite()) {
            return Err("窗口位置无效".into());
        }
        let current = self.snapshot()?;
        if current.settings.focus_id != s.focus_id && current.tasks.iter().any(|task| {
            current.settings.focus_id.as_deref() == Some(task.id.as_str()) && task.status == "todo"
        }) {
            return Err("请先暂停或完成正在做的任务，再开始其他任务".into());
        }
        if let Some(id) = &s.focus_id {
            if !current.tasks
                .iter()
                .any(|t| &t.id == id && t.status == "todo")
            {
                return Err("只能专注于待办任务".into());
            }
        }
        let tx = self.conn.transaction().map_err(err)?;
        if s.focus_id != current.settings.focus_id {
            if let Some(id) = &s.focus_id {
                let task = current.tasks.iter().find(|t| &t.id == id).ok_or("任务不存在")?;
                let now = Utc::now().to_rfc3339();
                let mut log = task.activity_log.clone();
                seed_history(task, &mut log);
                let action = if task.started_at.is_some() || log.iter().any(|e| ["started", "resumed"].contains(&e.action.as_str())) { "resumed" } else { "started" };
                log.push(ActivityEvent::new(action, &now));
                tx.execute("UPDATE tasks SET started_at=COALESCE(started_at,?1),updated_at=?1,activity_log=?2 WHERE id=?3", params![now,serde_json::to_string(&log).map_err(err)?,id]).map_err(err)?;
            }
        }
        tx.execute("UPDATE settings SET payload=?1 WHERE id=1", [serde_json::to_string(&s).map_err(err)?]).map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn set_focus(&mut self, id: Option<String>) -> Result<()> {
        let mut s = self.snapshot()?.settings;
        s.focus_id = id;
        self.set_settings(s)
    }
    pub fn pause_task(&mut self, id: &str) -> Result<()> {
        let snapshot = self.snapshot()?;
        let task = snapshot.tasks.iter().find(|t|t.id == id && t.status == "todo").ok_or("待办任务不存在")?;
        if snapshot.settings.focus_id.as_deref() != Some(id) { return Err("只能暂停正在做的任务".into()); }
        let mut settings = snapshot.settings;
        settings.focus_id = None;
        let mut log = task.activity_log.clone();
        seed_history(task, &mut log);
        let now = Utc::now().to_rfc3339();
        log.push(ActivityEvent::new("paused", &now));
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("UPDATE tasks SET updated_at=?1,activity_log=?2 WHERE id=?3",params![now,serde_json::to_string(&log).map_err(err)?,id]).map_err(err)?;
        tx.execute("UPDATE settings SET payload=?1 WHERE id=1",[serde_json::to_string(&settings).map_err(err)?]).map_err(err)?;
        tx.commit().map_err(err)
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
    pub fn deadline_delivered(&self, id: &str, deadline: &str) -> Result<bool> {
        self.conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM deadline_delivered WHERE task_id=?1 AND deadline=?2)",
                params![id, deadline],
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
        for (id, deadline) in &n.deadlines {
            tx.execute(
                "INSERT OR IGNORE INTO deadline_delivered VALUES(?1,?2)",
                params![id, deadline],
            )
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

fn validate_task(i:&TaskInput)->Result<()> {
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
        if i.due_time
            .as_deref()
            .is_some_and(|t| !["12:00", "17:00"].contains(&t))
            || (i.due_time.is_some() && i.due_date.is_none())
        {
            return Err("请选择上午或下午的截止时间".into());
        }
    if i.category.as_deref().is_some_and(|value|!["work","life"].contains(&value)){return Err("任务标签仅支持工作或生活".into());}
    Ok(())
}

// Legacy timestamps are evidence; migration itself never invents transitions.
pub(crate) fn seed_history(task: &Task, log: &mut Vec<ActivityEvent>) {
    if log.is_empty() {
        if let Some(at) = &task.started_at { log.push(ActivityEvent::new("started", at)); }
    }
    if let Some(at) = &task.completed_at {
        let recorded = log.iter().any(|event| event.action == "completed" &&
            (event.at == *at || DateTime::parse_from_rfc3339(at).ok().is_some_and(|time|
                DateTime::parse_from_rfc3339(&event.at).ok() == Some(time))));
        if !recorded { log.push(ActivityEvent::new("completed", at)); }
    }
}
