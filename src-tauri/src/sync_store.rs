use crate::store::{ActivityEvent, Result, Store, Task};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTask {
    #[serde(flatten)]
    pub task: Task,
    pub in_progress: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_ups: Option<Vec<crate::store::TaskStep>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mutation {
    pub mutation_id: String,
    pub task_id: String,
    pub base_revision: i64,
    pub deleted: bool,
    pub task: Option<SyncTask>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub task_id: String,
    pub revision: i64,
    pub deleted: bool,
    pub task: Option<SyncTask>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub mutation_id: String,
    pub task_id: String,
    pub status: String,
    pub revision: Option<i64>,
    pub reason: Option<String>,
    pub remote: Option<Change>,
    pub active_task: Option<Change>,
}
#[derive(Serialize)]
pub struct SyncRequest {
    pub cursor: i64,
    pub mutations: Vec<Mutation>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub results: Vec<MutationResult>,
    pub changes: Vec<Change>,
    pub cursor: i64,
    pub has_more: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub account_id: String,
    pub code_hint: String,
    pub expires_at: String,
    pub device_limit: usize,
    pub devices_used: usize,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum CachedAuthorization {
    License(LicenseStatus),
    Activation { #[serde(rename="accountId")] account_id: String, #[serde(rename="activationOnly")] _activation_only: bool },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub bound: bool,
    pub device_name: String,
    #[serde(default)]
    pub license: Option<LicenseStatus>,
    pub account_id: Option<String>,
    pub enabled: bool,
    pub pending: usize,
    pub conflicts: Vec<MutationResult>,
}
pub fn device_name(installation: &str) -> String {
    let compact = installation.replace('-', "");
    let number = u32::from_str_radix(compact.get(..8).unwrap_or("0"),16).unwrap_or(0) % 10000;
    format!("{} · {number:04}", if cfg!(target_os="windows") { "Windows" } else { "Mac" })
}
fn encode(value: &impl Serialize) -> Result<String> {
    serde_json::to_string(value).map_err(err)
}
impl Store {
    pub fn sync_initialize(&self) -> Result<()> {
        self.conn.execute_batch("CREATE TABLE IF NOT EXISTS sync_meta(id INTEGER PRIMARY KEY CHECK(id=1),account TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,cursor INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS sync_rows(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,baseline TEXT NOT NULL DEFAULT 'null',pending TEXT,conflict TEXT); CREATE TABLE IF NOT EXISTS sync_license(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);").map_err(err)
    }
    pub fn sync_link(&self, account: &str) -> Result<()> {
        self.sync_initialize()?;
        let previous: Option<String> = self
            .conn
            .query_row("SELECT account FROM sync_meta WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(err)?;
        if previous.as_deref().is_some_and(|id| id != account) {
            return Err(
                "本机任务属于其他工作空间。请先导出任务，并使用新的本地配置；不能切换授权码混合任务。".into(),
            );
        }
        self.conn
            .execute(
                "INSERT OR IGNORE INTO sync_meta(id,account) VALUES(1,?1)",
                [account],
            )
            .map_err(err)?;
        Ok(())
    }
    // Display-only metadata. Device tokens remain in the system keychain.
    pub fn sync_cache_license(&self, license: Option<&LicenseStatus>) -> Result<()> {
        self.sync_initialize()?;
        if let Some(license) = license {
            let account: Option<String> = self.conn.query_row("SELECT account FROM sync_meta WHERE id=1", [], |r| r.get(0)).optional().map_err(err)?;
            if account.as_deref() != Some(&license.account_id) { return Err("授权工作空间不一致".into()); }
            self.conn.execute("INSERT INTO sync_license(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [serde_json::to_string(license).map_err(err)?]).map_err(err)?;
        } else {
            self.conn.execute("DELETE FROM sync_license WHERE id=1", []).map_err(err)?;
        }
        Ok(())
    }
    pub fn sync_cache_activation(&self, account: &str) -> Result<()> {
        self.sync_initialize()?;
        let current: Option<String> = self.conn.query_row("SELECT account FROM sync_meta WHERE id=1", [], |r| r.get(0)).optional().map_err(err)?;
        if current.as_deref() != Some(account) { return Err("授权工作空间不一致".into()); }
        let payload = serde_json::json!({"accountId":account,"activationOnly":true}).to_string();
        self.conn.execute("INSERT OR IGNORE INTO sync_license(id,payload) VALUES(1,?1)", [payload]).map_err(err)?;
        Ok(())
    }
    pub fn sync_is_enabled(&self) -> Result<bool> {
        self.sync_initialize()?;
        self.conn.query_row("SELECT enabled FROM sync_meta WHERE id=1", [], |row| row.get(0)).optional().map(|value| value.unwrap_or(false)).map_err(err)
    }
    pub fn sync_enable(&self) -> Result<()> {
        let enabled: bool = self
            .conn
            .query_row("SELECT enabled FROM sync_meta WHERE id=1", [], |r| r.get(0))
            .map_err(err)?;
        if !enabled {
            if let Some(path) = self.conn.path().filter(|path| !path.is_empty()) {
                let path = std::path::Path::new(path);
                let mut backup = rusqlite::Connection::open(path.with_extension(format!(
                    "before-sync-{}.db",
                    chrono::Utc::now().timestamp_millis()
                )))
                .map_err(err)?;
                rusqlite::backup::Backup::new(&self.conn, &mut backup)
                    .map_err(err)?
                    .run_to_completion(32, std::time::Duration::from_millis(10), None)
                    .map_err(err)?;
            }
        }
        self.conn
            .execute("UPDATE sync_meta SET enabled=1 WHERE id=1", [])
            .map_err(err)?;
        Ok(())
    }
    pub fn sync_disable(&self) -> Result<()> {
        self.sync_initialize()?;
        self.conn
            .execute("UPDATE sync_meta SET enabled=0 WHERE id=1", [])
            .map_err(err)?;
        Ok(())
    }
    fn sync_local(&self) -> Result<BTreeMap<String, SyncTask>> {
        let snapshot = self.snapshot()?;
        Ok(snapshot
            .tasks
            .into_iter()
            .map(|task| {
                let state = snapshot.workflows.get(&task.id).map(|w| w.state.as_str()).unwrap_or("idle");
                let active = state != "idle" && task.status == "todo";
                (
                    task.id.clone(),
                    SyncTask {
                        in_progress: active,
                        execution_state: Some(if active { state } else { "idle" }.into()),
                        follow_ups: Some(snapshot.workflows.get(&task.id).map(|w|w.steps.clone()).unwrap_or_default()),
                        task,
                    },
                )
            })
            .collect())
    }
    fn sync_reconcile_completions(&self) -> Result<()> {
        let conflicts: Vec<(String,String)> = self.conn.prepare("SELECT id,conflict FROM sync_rows WHERE conflict IS NOT NULL").map_err(err)?.query_map([], |r| Ok((r.get(0)?,r.get(1)?))).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)?;
        if conflicts.is_empty() { return Ok(()); }
        let local = self.sync_local()?;
        let mut settings = self.snapshot()?.settings;
        let tx = self.conn.unchecked_transaction().map_err(err)?;
        for (id, raw) in conflicts {
            let result: MutationResult = serde_json::from_str(&raw).map_err(err)?;
            if result.reason.as_deref() != Some("revision_changed") { continue; }
            if let (Some(local), Some(remote)) = (local.get(&id), result.remote.as_ref()) {
                if !remote.deleted && remote.task.as_ref().is_some_and(|cloud| completion_can_merge(local,cloud)) {
                    apply_change(&tx,remote,&mut settings)?;
                    tx.execute("UPDATE sync_rows SET revision=?1,baseline=?2,pending=NULL,conflict=NULL WHERE id=?3",params![remote.revision,encode(&remote.task)?,id]).map_err(err)?;
                }
            }
        }
        tx.execute("UPDATE settings SET payload=?1 WHERE id=1",[encode(&settings)?]).map_err(err)?;
        tx.commit().map_err(err)
    }
    fn sync_capture(&self) -> Result<()> {
        self.sync_initialize()?;
        self.sync_reconcile_completions()?;
        let local = self.sync_local()?;
        for id in local.keys() {
            self.conn
                .execute("INSERT OR IGNORE INTO sync_rows(id) VALUES(?1)", [id])
                .map_err(err)?;
        }
        let rows: Vec<(String, i64, String, Option<String>)> = self
            .conn
            .prepare("SELECT id,revision,baseline,pending FROM sync_rows")
            .map_err(err)?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        for (id, revision, baseline, pending) in rows {
            let task = local.get(&id).cloned();
            let payload = encode(&task)?;
            if let Some(raw) = pending {
                let old: Mutation = serde_json::from_str(&raw).map_err(err)?;
                if encode(&old.task)? == payload {
                    continue;
                }
            } else if payload == baseline {
                continue;
            }
            let mutation = Mutation {
                mutation_id: uuid::Uuid::new_v4().to_string(),
                task_id: id.clone(),
                base_revision: revision,
                deleted: task.is_none(),
                task,
            };
            self.conn
                .execute(
                    "UPDATE sync_rows SET pending=?1 WHERE id=?2",
                    params![encode(&mutation)?, id],
                )
                .map_err(err)?;
        }
        Ok(())
    }
    pub fn sync_request_if_enabled(&self) -> Result<Option<SyncRequest>> {
        if !self.sync_is_enabled()? { return Ok(None); }
        self.sync_request().map(Some)
    }
    pub fn sync_request(&self) -> Result<SyncRequest> {
        self.sync_capture()?;
        let cursor = self
            .conn
            .query_row("SELECT cursor FROM sync_meta WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(err)?
            .unwrap_or(0);
        let raws:Vec<String>=self.conn.prepare("SELECT pending FROM sync_rows WHERE pending IS NOT NULL AND conflict IS NULL ORDER BY id").map_err(err)?.query_map([],|r|r.get(0)).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)?;
        let mut candidates: Vec<Mutation> = raws
            .iter()
            .map(|raw| serde_json::from_str(raw).map_err(err))
            .collect::<Result<_>>()?;
        candidates.sort_by_key(|m| m.task.as_ref().is_some_and(|t| t.in_progress));
        let mut mutations = Vec::new();
        let mut size = 100;
        for mutation in candidates {
            let length = encode(&mutation)?.len();
            if mutations.is_empty() && size + length > 80000 {
                return Err("单项任务历史过长，暂时无法云同步；本地记录完整保留".into());
            }
            if mutations.len() >= 50 || size + length > 80000 {
                break;
            }
            size += length;
            mutations.push(mutation);
        }
        Ok(SyncRequest { cursor, mutations })
    }
    pub fn sync_status(&self) -> Result<SyncStatus> {
        self.sync_capture()?;
        let meta: Option<(String, bool)> = self
            .conn
            .query_row(
                "SELECT account,enabled FROM sync_meta WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?;
        let pending = self
            .conn
            .query_row(
                "SELECT count(*) FROM sync_rows WHERE pending IS NOT NULL",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map_err(err)? as usize;
        let conflicts: Vec<String> = self
            .conn
            .prepare("SELECT conflict FROM sync_rows WHERE conflict IS NOT NULL ORDER BY id")
            .map_err(err)?
            .query_map([], |r| r.get(0))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        let raw: Option<String> = self.conn.query_row("SELECT payload FROM sync_license WHERE id=1", [], |r| r.get(0)).optional().map_err(err)?;
        let cached = raw.map(|raw| serde_json::from_str::<CachedAuthorization>(&raw).map_err(err)).transpose()?;
        let (bound, license) = match cached {
            Some(CachedAuthorization::License(license)) if meta.as_ref().is_some_and(|m| m.0 == license.account_id) => (true, Some(license)),
            Some(CachedAuthorization::Activation { account_id, .. }) if meta.as_ref().is_some_and(|m| m.0 == account_id) => (true, None),
            _ => (false, None),
        };
        Ok(SyncStatus {
            bound,
            device_name: device_name(&self.local_identity()?.user_id),
            license,
            account_id: meta.as_ref().map(|m| m.0.clone()),
            enabled: meta.is_some_and(|m| m.1),
            pending,
            conflicts: conflicts
                .iter()
                .map(|raw| serde_json::from_str(raw).map_err(err))
                .collect::<Result<_>>()?,
        })
    }
    pub fn sync_apply(&mut self, response: SyncResponse) -> Result<()> {
        self.ensure_workflows()?;
        // Capture changes made while HTTP was in flight before acknowledging the sent version.
        self.sync_capture()?;
        let mut settings = self.snapshot()?.settings;
        let tx = self.conn.transaction().map_err(err)?;
        for result in response.results {
            let raw: Option<String> = tx
                .query_row(
                    "SELECT pending FROM sync_rows WHERE id=?1",
                    [&result.task_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?
                .flatten();
            let Some(raw) = raw else { continue };
            let mut pending: Mutation = serde_json::from_str(&raw).map_err(err)?;
            if result.status == "accepted" {
                let revision = result.revision.ok_or("同步响应缺少版本号")?;
                // The response's matching change is the acknowledged baseline, not a newer local edit.
                let accepted = response
                    .changes
                    .iter()
                    .find(|c| c.task_id == result.task_id && c.revision == revision);
                let baseline = if let Some(change) = accepted {
                    encode(&change.task)?
                } else if pending.mutation_id == result.mutation_id {
                    encode(&pending.task)?
                } else {
                    tx.query_row(
                        "SELECT baseline FROM sync_rows WHERE id=?1",
                        [&result.task_id],
                        |r| r.get::<_, String>(0),
                    )
                    .map_err(err)?
                };
                let next = if pending.mutation_id == result.mutation_id {
                    None
                } else {
                    pending.base_revision = revision;
                    Some(encode(&pending)?)
                };
                tx.execute(
                    "UPDATE sync_rows SET revision=?1,baseline=?2,pending=?3 WHERE id=?4",
                    params![revision, baseline, next, result.task_id],
                )
                .map_err(err)?;
            } else if result.status == "conflict" {
                if result.reason.as_deref() == Some("revision_changed") {
                    if let (Some(local), Some(remote)) = (pending.task.as_ref(), result.remote.as_ref()) {
                        if remote.task.as_ref().is_some_and(|cloud| completion_can_merge(local, cloud)) && !remote.deleted {
                            apply_change(&tx, remote, &mut settings)?;
                            tx.execute("UPDATE sync_rows SET revision=?1,baseline=?2,pending=NULL,conflict=NULL WHERE id=?3", params![remote.revision, encode(&remote.task)?, result.task_id]).map_err(err)?;
                            continue;
                        }
                    }
                }
                tx.execute(
                    "UPDATE sync_rows SET conflict=?1 WHERE id=?2",
                    params![encode(&result)?, result.task_id],
                )
                .map_err(err)?;
            }
        }
        let conflicts: Vec<(String, String)> = tx
            .prepare("SELECT id,conflict FROM sync_rows WHERE conflict IS NOT NULL")
            .map_err(err)?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        let mut conflicts: Vec<(String, MutationResult)> = conflicts
            .into_iter()
            .map(|(id, raw)| Ok((id, serde_json::from_str(&raw).map_err(err)?)))
            .collect::<Result<_>>()?;
        for change in response.changes {
            for (id, conflict) in &mut conflicts {
                if *id == change.task_id
                    && conflict
                        .remote
                        .as_ref()
                        .is_none_or(|remote| change.revision >= remote.revision)
                {
                    conflict.remote = Some(change.clone());
                }
                if conflict.active_task.as_ref().is_some_and(|active| {
                    active.task_id == change.task_id && change.revision >= active.revision
                }) {
                    conflict.active_task = Some(change.clone());
                }
            }
            let pending: Option<(Option<String>, Option<String>)> = tx
                .query_row(
                    "SELECT pending,conflict FROM sync_rows WHERE id=?1",
                    [&change.task_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(err)?;
            if pending
                .as_ref()
                .is_some_and(|p| p.0.is_some() || p.1.is_some())
            {
                continue;
            }
            apply_change(&tx, &change, &mut settings)?;
            tx.execute("INSERT INTO sync_rows(id,revision,baseline) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,baseline=excluded.baseline",params![change.task_id,change.revision,encode(&change.task)?]).map_err(err)?;
        }
        tx.execute(
            "UPDATE settings SET payload=?1 WHERE id=1",
            [encode(&settings)?],
        )
        .map_err(err)?;
        for (id, conflict) in conflicts {
            tx.execute(
                "UPDATE sync_rows SET conflict=?1 WHERE id=?2",
                params![encode(&conflict)?, id],
            )
            .map_err(err)?;
        }
        tx.execute(
            "UPDATE sync_meta SET cursor=?1 WHERE id=1",
            [response.cursor],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn sync_resolve(&mut self, id: &str, keep_local: bool) -> Result<()> {
        self.ensure_workflows()?;
        self.sync_capture()?;
        let raw: String = self
            .conn
            .query_row("SELECT conflict FROM sync_rows WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(err)?;
        let result: MutationResult = serde_json::from_str(&raw).map_err(err)?;
        let remote = result.remote.ok_or("缺少云端版本，请重新同步")?;
        let queue_local = result.reason.as_deref() == Some("another_task_in_progress");
        let mut settings = self.snapshot()?.settings;
        let tx = self.conn.transaction().map_err(err)?;
        if queue_local {
            if settings.focus_id.as_deref() == Some(id) {
                settings.focus_id = None;
            }
            // Cloud can queue its single focus without stopping parallel local work.
        } else if !keep_local {
            apply_change(&tx, &remote, &mut settings)?;
        }
        if !keep_local || queue_local {
            if let Some(active) = result.active_task {
                let dirty: bool = tx
                    .query_row(
                        "SELECT pending IS NOT NULL FROM sync_rows WHERE id=?1",
                        [&active.task_id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(err)?
                    .unwrap_or(false);
                if !dirty {
                    apply_change(&tx, &active, &mut settings)?;
                    tx.execute("INSERT INTO sync_rows(id,revision,baseline) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,baseline=excluded.baseline",params![active.task_id,active.revision,encode(&active.task)?]).map_err(err)?;
                }
            }
        }
        tx.execute(
            "UPDATE sync_rows SET revision=?1,baseline=?2,pending=NULL,conflict=NULL WHERE id=?3",
            params![remote.revision, encode(&remote.task)?, id],
        )
        .map_err(err)?;
        tx.execute(
            "UPDATE settings SET payload=?1 WHERE id=1",
            [encode(&settings)?],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }
}
fn completion_can_merge(local: &SyncTask, remote: &SyncTask) -> bool {
    let a = &local.task; let b = &remote.task;
    a.status == "todo" && b.status == "completed" &&
    (remote.follow_ups.is_none() || local.follow_ups == remote.follow_ups) &&
    a.title == b.title && a.description == b.description && a.priority == b.priority &&
    a.category == b.category && a.due_date == b.due_date && a.due_time == b.due_time &&
    !a.activity_log.iter().any(|event| event.action == "reopened" && b.completed_at.as_ref().is_some_and(|at| event.at >= *at))
}
fn apply_change(
    tx: &rusqlite::Transaction<'_>,
    change: &Change,
    settings: &mut crate::store::Settings,
) -> Result<()> {
    if settings.focus_id.as_deref() == Some(&change.task_id) {
        settings.focus_id = None;
    }
    if change.deleted {
        tx.execute("DELETE FROM snoozes WHERE task_id=?1", [&change.task_id])
            .map_err(err)?;
        tx.execute(
            "DELETE FROM deadline_delivered WHERE task_id=?1",
            [&change.task_id],
        )
        .map_err(err)?;
        tx.execute("DELETE FROM tasks WHERE id=?1", [&change.task_id])
            .map_err(err)?;
        return Ok(());
    }
    let synced = change.task.as_ref().ok_or("同步响应缺少任务")?;
    let mut task = synced.task.clone();
    let workflow: Option<String> = tx.query_row("SELECT state FROM task_workflows WHERE task_id=?1", [&task.id], |r| r.get(0)).optional().map_err(err)?;
    let locally_active = task.status != "completed" && synced.execution_state.is_none() && workflow.as_deref().is_some_and(|state| ["working", "waiting"].contains(&state));
    let previous: Option<(String, Option<String>)> = tx.query_row("SELECT activity_log,started_at FROM tasks WHERE id=?1", [&task.id], |r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(err)?;
    if let Some((raw, started)) = previous {
        let previous: Vec<ActivityEvent> = serde_json::from_str(&raw).map_err(err)?;
        // The accepted remote sequence is causal even when device clocks change.
        // Retain every server event. Dropping legacy pause/resume events made
        // the local payload differ from its acknowledged baseline forever.
        let mut merged = task.activity_log.clone();
        for event in previous { if !merged.iter().any(|old|old.id==event.id) {merged.push(event);} }
        task.activity_log = merged;
        task.started_at = match (started, task.started_at) {
            (Some(a),Some(b)) => Some(if chrono::DateTime::parse_from_rfc3339(&a).ok() <= chrono::DateTime::parse_from_rfc3339(&b).ok() {a} else {b}),
            (a,b) => a.or(b),
        };
    }
    if !locally_active && synced.in_progress && synced.execution_state.as_deref() != Some("waiting") && task.status == "todo" && task.activity_log.last().is_some_and(|event|
        ["paused", "completed", "reopened"].contains(&event.action.as_str())) {
        // Accepting the active cloud state starts a new local interval now.
        let now = chrono::Utc::now().to_rfc3339();
        task.activity_log.push(ActivityEvent::new("resumed", &now));
        task.updated_at = now;
    }
    if task.status == "completed" {
        let mut log = task.activity_log.clone();
        crate::store::seed_history(&task, &mut log);
        task.activity_log = log;
    }
    let t = &task;
    if t.id != change.task_id
        || t.title.trim().is_empty()
        || t.title.chars().count() > 200
        || t.description.chars().count() > 10000
        || !["todo", "completed"].contains(&t.status.as_str())
        || !["high", "med", "low"].contains(&t.priority.as_str())
    {
        return Err("云端任务格式无效".into());
    }
    tx.execute("INSERT INTO tasks(id,title,description,priority,status,due_date,due_time,created_at,updated_at,completed_at,started_at,category,activity_log) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,priority=excluded.priority,status=excluded.status,due_date=excluded.due_date,due_time=excluded.due_time,created_at=excluded.created_at,updated_at=excluded.updated_at,completed_at=excluded.completed_at,started_at=excluded.started_at,category=excluded.category,activity_log=excluded.activity_log",params![t.id,t.title,t.description,t.priority,t.status,t.due_date,t.due_time,t.created_at,t.updated_at,t.completed_at,t.started_at,t.category,encode(&t.activity_log)?]).map_err(err)?;
    if synced.in_progress && t.status == "todo" {
        settings.focus_id = Some(t.id.clone())
    } else if settings.focus_id.as_deref() == Some(t.id.as_str()) { settings.focus_id = None; }
    let state = if t.status == "completed" { "idle" } else if let Some(state) = synced.execution_state.as_deref() {
        if !["idle", "working", "waiting"].contains(&state) || (state != "idle") != synced.in_progress { return Err("云端执行状态无效".into()); }
        state
    } else if locally_active {
        workflow.as_deref().unwrap_or("idle")
    } else if synced.in_progress { "working" } else { "idle" };
    tx.execute("INSERT INTO task_workflows(task_id,state) VALUES(?1,?2) ON CONFLICT(task_id) DO UPDATE SET state=excluded.state", params![t.id,state]).map_err(err)?;
    if let Some(steps) = &synced.follow_ups {
        let mut ids = std::collections::BTreeSet::new();
        if steps.iter().any(|step| step.content.trim().is_empty() || step.content.chars().count()>2000 || !ids.insert(&step.id) || chrono::DateTime::parse_from_rfc3339(&step.created_at).is_err()) {return Err("云端跟进记录格式无效".into());}
        tx.execute("UPDATE task_workflows SET steps=?1 WHERE task_id=?2",params![encode(steps)?,t.id]).map_err(err)?;
    }
    if t.status == "completed" {
        tx.execute("DELETE FROM snoozes WHERE task_id=?1", [&t.id])
            .map_err(err)?;
    }
    Ok(())
}
