use crate::{
    store::Result,
    sync_credentials::{self, Credential},
    sync_store::{LicenseStatus, SyncResponse, SyncStatus},
    AppState,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    io::Read,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
#[cfg(any(debug_assertions, feature = "local-sync"))]
const BASE: &str = "http://127.0.0.1:3102/task-sprite";
#[cfg(not(any(debug_assertions, feature = "local-sync")))]
const BASE: &str = "https://tbtparent.me/task-sprite/api/task-sprite";
pub struct SyncRuntime(pub AtomicBool);
static GENERATION: AtomicU64 = AtomicU64::new(0);
pub static PENDING: AtomicBool = AtomicBool::new(true);
pub fn signal() { PENDING.store(true, Ordering::Release); }
static UPLOAD_ADMISSION: std::sync::Mutex<()> = std::sync::Mutex::new(());
static WAIT_ADMISSION: std::sync::Mutex<()> = std::sync::Mutex::new(());
static LAST_SYNC: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
static RETRY_UNTIL: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
static LICENSE_CHECK: std::sync::Mutex<Option<(u64,String,Instant)>> = std::sync::Mutex::new(None);

fn with_admission<T>(gate: &std::sync::Mutex<()>, valid: impl FnOnce() -> bool, send: impl FnOnce() -> Result<T>) -> Result<T> {
    let _guard = gate.lock().map_err(|_| "同步请求暂不可用")?;
    if !valid() { return Err("同步设置已改变，请等待自动重试".into()); }
    send()
}
// App-independent transport seam: tests exercise the same authenticated lifecycle
// as the actual HTTP callers, using isolated stores and scripted responses.
fn authenticated_call<T>(store: &std::sync::Mutex<crate::store::Store>, epoch: &AtomicU64, generation: u64, credential: &Credential, require_sync: bool, send: impl FnOnce() -> Result<T>, notify: impl FnOnce(&crate::store::Snapshot)) -> Result<T> {
    {
        let store = store.lock().map_err(|_| "数据库暂不可用")?;
        let current = store.sync_status()?;
        if epoch.load(Ordering::Acquire) != generation || current.account_id.as_deref() != Some(&credential.account) || (require_sync && !current.enabled) {
            return Err("同步设置已改变，请等待自动重试".into());
        }
    }
    let result = send();
    if let Err(error) = &result {
        let store = store.lock().map_err(|_| "数据库暂不可用")?;
        if crate::looks::reject_looks_if_current(&store, &credential.account, generation, epoch.load(Ordering::Acquire), error)? {
            // Marker and epoch advance share the store lock with successful cache
            // commits; an earlier status response can never overwrite rejection.
            epoch.fetch_add(1, Ordering::AcqRel);
            notify(&store.snapshot()?);
        }
    }
    result
}
fn cache_license_if_current(store: &crate::store::Store, epoch: &AtomicU64, generation: u64, account: &str, license: &LicenseStatus) -> Result<bool> {
    let current = store.sync_status()?;
    if epoch.load(Ordering::Acquire) != generation || !current.enabled || current.account_id.as_deref() != Some(account) { return Ok(false); }
    store.sync_cache_license(Some(license))?;
    Ok(true)
}
fn admitted_request<T: DeserializeOwned>(app: &tauri::AppHandle, generation: u64, path: &str, credential: &Credential, body: &impl Serialize) -> Result<T> {
    let gate = if path == "/changes/wait" { &WAIT_ADMISSION } else { &UPLOAD_ADMISSION };
    with_admission(gate, || true, || {
        if path == "/sync" {
            let mut last=LAST_SYNC.lock().map_err(|_| "同步计时暂不可用")?;
            if let Some(at)=*last { if let Some(wait)=Duration::from_secs(5).checked_sub(at.elapsed()) { std::thread::sleep(wait); } }
            *last=Some(Instant::now());
        }
        let state = app.state::<AppState>();
        authenticated_call(&state.0, &GENERATION, generation, credential, true, || request(path, Some(credential), body), |snapshot| { let _ = app.emit("snapshot", snapshot); })
    })
}
fn decompose_with(store: &std::sync::Mutex<crate::store::Store>, epoch: &AtomicU64, generation: u64, credential: &Credential, content: String, utc_offset_minutes: i32, send: impl FnOnce(&serde_json::Value) -> Result<serde_json::Value>, notify: impl FnOnce(&crate::store::Snapshot)) -> Result<serde_json::Value> {
    if content.trim().is_empty() || content.chars().count() > 3000 { return Err("智能拆解一次支持1–3000字".into()); }
    authenticated_call(store, epoch, generation, credential, false,
        || send(&serde_json::json!({"content":content,"utcOffsetMinutes":utc_offset_minutes})), notify)
}

fn invalidate() -> Result<(std::sync::MutexGuard<'static, ()>, std::sync::MutexGuard<'static, ()>)> {
    // Separate gates keep long waits from delaying local uploads. Lifecycle changes
    // wait for already admitted requests, then forbid all stale admissions.
    let _upload = UPLOAD_ADMISSION.lock().map_err(|_| "同步请求暂不可用")?;
    let _wait = WAIT_ADMISSION.lock().map_err(|_| "同步请求暂不可用")?;
    GENERATION.fetch_add(1, Ordering::AcqRel);
    Ok((_upload, _wait))
}
struct UploadWorker { retry: u64 }
impl UploadWorker {
    fn drain(&mut self, pending: &AtomicBool, run: impl FnOnce() -> Result<()>) -> Option<(u64, String)> {
        if !pending.swap(false, Ordering::AcqRel) { return None; }
        match run() {
            Ok(()) => { self.retry = 1; None }
            Err(error) => { pending.store(true, Ordering::Release); let delay = self.retry; self.retry = (self.retry * 2).min(30); Some((delay, error)) }
        }
    }
}
fn advanced_notice(changed: bool, revision: i64, cursor: i64) -> bool { changed && revision > cursor }
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release)
    }
}
fn request<T: DeserializeOwned>(
    path: &str,
    credential: Option<&Credential>,
    body: &impl Serialize,
) -> Result<T> {
    if RETRY_UNTIL.lock().map_err(|_| "同步退避状态暂不可用")?.is_some_and(|at|at>Instant::now()) {return Err("请求较多，等待服务端允许后自动重试（429）".into());}
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化同步连接")?;
    let mut request = client.post(format!("{BASE}{path}")).json(body);
    if let Some(credential) = credential {
        request = request.bearer_auth(&credential.token).header("X-Task-Sprite-Account", &credential.account);
    }
    let response = request
        .send()
        .map_err(|_| "同步服务暂时无法连接，任务已保存在本机；联网后会重试")?;
    if response.status().as_u16() == 429 {
        let seconds=response.headers().get("retry-after").and_then(|h|h.to_str().ok()).and_then(|v|v.parse::<u64>().ok()).unwrap_or(60).clamp(1,300);
        *RETRY_UNTIL.lock().map_err(|_| "同步退避状态暂不可用")?=Some(Instant::now()+Duration::from_secs(seconds));
        return Err("请求较多，等待服务端允许后自动重试（429）".into());
    }
    if response.status().as_u16() == 401 {
        return Err("此电脑的授权已失效或已停用，请重新激活授权".into());
    }
    if response.status().as_u16() == 403 {
        return Err("授权已到期或已停用，请检查授权；本机任务仍保留".into());
    }
    if response.status().as_u16() == 409 {
        return Err("激活未完成：授权设备名额已满，或授权码属于其他工作空间。请先检查设备；切换工作空间需先导出任务并使用新的本地配置。".into());
    }
    if response.status().as_u16() == 400 {
        return Err("授权码无效，请检查后重试".into());
    }
    if response.status().as_u16()==503 {return Err("智能拆解尚未配置，可以先使用基础拆分".into());}
    if !response.status().is_success() {
        return Err(format!(
            "同步服务暂不可用（{}），本地任务仍保留",
            response.status().as_u16()
        ));
    }
    let mut bytes = Vec::new();
    response
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "同步响应读取失败")?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("同步响应过大，请联系支持".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "同步服务响应异常，请稍后重试".into())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Activation {
    account_id: String,
    device_token: String,
    license: LicenseStatus,
}
pub fn activation_body(code: &str, installation_id: &str, expected_account: Option<&str>) -> Result<serde_json::Value> {
    let compact: String = code.chars().filter(|c| !c.is_whitespace() && *c != '-').flat_map(char::to_uppercase).collect();
    if compact.len() != 26 || !compact.starts_with("TS") || !compact.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return Err("授权码格式不正确，请输入完整授权码".into());
    }
    let code = format!("TS-{}", compact[2..].as_bytes().chunks(4).map(|part| std::str::from_utf8(part).unwrap()).collect::<Vec<_>>().join("-"));
    let mut body = serde_json::json!({"code":code,"installationId":installation_id,"deviceName":crate::sync_store::device_name(installation_id)});
    if let Some(account) = expected_account { body["expectedAccountId"] = account.into(); }
    Ok(body)
}
pub fn activate(app: &tauri::AppHandle, code: &str) -> Result<SyncStatus> {
    let _admission = invalidate()?;
    let runtime = app.state::<SyncRuntime>();
    runtime.0.compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed).map_err(|_| "正在同步，请稍后激活")?;
    let _busy = Busy(&runtime.0);
    let body = {
        let state = app.state::<AppState>();
        let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
        activation_body(code, &store.local_identity()?.user_id, store.sync_status()?.account_id.as_deref())?
    };
    let result: Activation = request("/licenses/activate", None, &body)?;
    if !result.device_token.starts_with("tsd_") || result.device_token.len() != 47 || result.license.account_id != result.account_id {
        return Err("授权服务响应异常，请重试".into());
    }
    let credential = Credential { account: result.account_id, token: result.device_token, license: Some(result.license) };
    let persist = (|| {
        let state = app.state::<AppState>();
        let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
        persist_activation(&store, &credential, sync_credentials::write)
    })();
    // A failed local save remains retryable on the same installation; never revoke its existing device row.
    persist?;
    status(app)
}
pub(crate) fn persist_activation(store: &crate::store::Store, credential: &Credential, save_secret: impl FnOnce(&Credential) -> Result<()>) -> Result<()> {
    store.sync_link(&credential.account)?;
    // Keep the existing upload consent when renewing the same desktop credential.
    save_secret(credential)?;
    store.sync_cache_license(credential.license.as_ref())
}
pub fn pause(app: &tauri::AppHandle) -> Result<SyncStatus> {
    let _admission = invalidate()?;
    { let state = app.state::<AppState>(); let store = state.0.lock().map_err(|_| "数据库暂不可用")?; store.sync_disable()?; }
    status(app)
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncEnvelope {
    #[serde(flatten)]
    tasks: SyncResponse,
    pet_image: Option<CloudPetImage>,
}

#[derive(serde::Deserialize)]
struct CloudPetImage {
    id: String,
    png: String,
}

pub fn synchronize(app: &tauri::AppHandle) -> Result<SyncStatus> {
    let generation = GENERATION.load(Ordering::Acquire);
    let runtime = app.state::<SyncRuntime>();
    if runtime
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
        .is_err()
    {
        signal();
        return Err("同步正在进行，变更已排队".into());
    }
    let _busy = Busy(&runtime.0);
    // Local-only mode never reads a credential or contacts the service.
    { let state = app.state::<AppState>(); let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
      let local = store.sync_status()?; if !local.enabled { return Ok(local); } }
    let initial = status(app)?;
    let credential = with_admission(&UPLOAD_ADMISSION, || status(app).map(|s| s.enabled && s.account_id == initial.account_id && GENERATION.load(Ordering::Acquire) == generation).unwrap_or(false), sync_credentials::read)?.ok_or("同步凭据暂不可用，请验证原授权码以恢复同步；本机任务与设备名额保留")?;
    if initial.account_id.as_deref() != Some(&credential.account) {
        return Err("同步工作空间不一致，请使用原工作空间的授权码".into());
    }
    let mut credential = credential;
    let check_license = LICENSE_CHECK.lock().map_err(|_| "授权检查暂不可用")?.as_ref().is_none_or(|(g,a,at)| *g!=generation || *a!=credential.account || at.elapsed()>=Duration::from_secs(300));
    if check_license {
        let installation_id={let state=app.state::<AppState>();let store=state.0.lock().map_err(|_| "数据库暂不可用")?;store.local_identity()?.user_id};
        let license: LicenseStatus = admitted_request(app,generation,"/licenses/status",&credential,&serde_json::json!({"platform":std::env::consts::OS,"installationId":installation_id}))?;
        if license.account_id != credential.account {return Err("授权工作空间不一致".into());}
        credential.license=Some(license);
        let state=app.state::<AppState>();let store=state.0.lock().map_err(|_| "数据库暂不可用")?;
        if !cache_license_if_current(&store,&GENERATION,generation,&credential.account,credential.license.as_ref().unwrap())? {return store.sync_status();}
        *LICENSE_CHECK.lock().map_err(|_| "授权检查暂不可用")?=Some((generation,credential.account.clone(),Instant::now()));
    }
    let mut last_payload = None;
    for _ in 0..5 {

        let request_body = {
            let state = app.state::<AppState>();
            let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
            match store.sync_request_if_enabled()? {
                Some(request) => request,
                None => { drop(store); return status(app); }
            }
        };
        let payload=serde_json::to_string(&request_body.mutations.iter().map(|m|(&m.mutation_id,&m.task_id,m.deleted)).collect::<Vec<_>>()).map_err(|e|e.to_string())?;
        if !request_body.mutations.is_empty() && last_payload.as_ref()==Some(&payload) {return Err("同步内容没有变化，已暂停重复上传，稍后自动重试".into());}
        last_payload=Some(payload);
        let response: SyncEnvelope = admitted_request(app, generation, "/sync", &credential, &request_body)?;
        let more = response.tasks.has_more;
        {
            let state = app.state::<AppState>();
            let mut store = state.0.lock().map_err(|_| "数据库暂不可用")?;
            if GENERATION.load(Ordering::Acquire) != generation || !store.sync_status()?.enabled || store.sync_status()?.account_id != initial.account_id {
                return store.sync_status();
            }
            if let Some(image) = response.pet_image {
                store.sync_cache_pet(&image.id, &image.png)?;
            }
            store.sync_apply(response.tasks)?;
            let snapshot = store.snapshot()?;
            let _ = app.emit("snapshot", &snapshot);
        }
        let current = status(app)?;
        let has_upload = {
            let state = app.state::<AppState>();
            let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
            !store.sync_request()?.mutations.is_empty()
        };
        if !more && !has_upload {
            let _ = app.emit("sync-status", &current);
            return Ok(current);
        }
    }
    signal();
    status(app)
}
pub fn status(app: &tauri::AppHandle) -> Result<SyncStatus> {
    let state = app.state::<AppState>();
    let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    // Opening or polling settings never accesses a secret or invokes system authentication.
    store.sync_status()
}
pub fn deactivate(app: &tauri::AppHandle) -> Result<()> {
    let _admission = invalidate()?;
    let runtime = app.state::<SyncRuntime>();
    runtime.0.compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed).map_err(|_| "正在同步，请稍后停用此电脑")?;
    let _busy = Busy(&runtime.0);
    // Keep a retryable activation if revocation cannot reach the service.
    if let Some(credential) = sync_credentials::read()? {
        let state = app.state::<AppState>();
        let generation = GENERATION.load(Ordering::Acquire);
        let result: Result<serde_json::Value> = authenticated_call(&state.0, &GENERATION, generation, &credential, false,
            || request("/device-session/revoke", Some(&credential), &serde_json::json!({})),
            |snapshot| { let _ = app.emit("snapshot", snapshot); });
        if let Err(error) = result {
            if error != "此电脑的授权已失效或已停用，请重新激活授权" {
                return Err(error);
            }
        }
    }
    {
        let state = app.state::<AppState>();
        let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
        store.sync_disable()?;
    }
    sync_credentials::clear()?;
    let state = app.state::<AppState>();
    let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    store.sync_cache_license(None)
}

pub fn decompose(app:&tauri::AppHandle,content:String,utc_offset_minutes:i32)->Result<serde_json::Value>{
    with_admission(&UPLOAD_ADMISSION, || true, || {
        let generation = GENERATION.load(Ordering::Acquire);
        let credential=sync_credentials::read()?.ok_or("请先在设置中激活授权；也可离线使用基础拆分")?;
        let state = app.state::<AppState>();
        decompose_with(&state.0, &GENERATION, generation, &credential, content, utc_offset_minutes,
            |body| request("/decompose",Some(&credential),body), |snapshot| { let _ = app.emit("snapshot", snapshot); })
    })
}

#[derive(Deserialize)]
struct ChangeNotice { revision: i64, changed: bool }
pub fn start_workers(app: tauri::AppHandle) {
    let uploader = app.clone();
    std::thread::spawn(move || {
        let mut worker = UploadWorker { retry: 1 };
        loop {
            std::thread::sleep(Duration::from_millis(100));
            if let Some((delay, error)) = worker.drain(&PENDING, || synchronize(&uploader).map(|_| ())) {
                let _ = uploader.emit("sync-warning", error);
                std::thread::sleep(Duration::from_secs(delay));
            }
        }
    });
    std::thread::spawn(move || {
        let mut retry = 1;
        let mut reconnect = true;
        let mut observed = 0;
        let mut observed_generation = GENERATION.load(Ordering::Acquire);
        loop {
            let result = (|| -> Result<()> {
                let generation = GENERATION.load(Ordering::Acquire);
                if observed_generation != generation { observed = 0; observed_generation = generation; reconnect = true; }
                let initial = status(&app)?;
                if !initial.enabled { reconnect = true; observed = 0; std::thread::sleep(Duration::from_secs(1)); return Ok(()); }
                let credential = with_admission(&WAIT_ADMISSION, || status(&app).map(|s| s.enabled && s.account_id == initial.account_id && GENERATION.load(Ordering::Acquire) == generation).unwrap_or(false), sync_credentials::read)?.ok_or("同步凭据暂不可用")?;
                if initial.account_id.as_deref() != Some(&credential.account) { return Err("同步工作空间不一致".into()); }
                if reconnect { signal(); reconnect = false; }
                let cursor = { let state = app.state::<AppState>(); let store = state.0.lock().map_err(|_| "数据库暂不可用")?; store.sync_request()?.cursor.max(observed) };
                let notice: ChangeNotice = admitted_request(&app, generation, "/changes/wait", &credential, &serde_json::json!({"cursor": cursor}))?;
                let current = status(&app)?;
                if GENERATION.load(Ordering::Acquire) == generation && current.enabled && current.account_id == initial.account_id && advanced_notice(notice.changed, notice.revision, cursor) { observed = notice.revision; signal(); }
                Ok(())
            })();
            if result.is_err() { reconnect = true; std::thread::sleep(Duration::from_secs(retry)); retry = (retry * 2).min(30); }
            else { retry = 1; }
        }
    });
}

#[cfg(test)]
mod worker_tests {
    use super::*;
    #[test]
    fn worker_retains_inflight_signal_and_cas_failure_and_bounds_retry() {
        let pending = AtomicBool::new(true);
        let mut worker = UploadWorker { retry: 1 };
        worker.drain(&pending, || { pending.store(true, Ordering::Release); Ok(()) });
        assert!(pending.load(Ordering::Acquire));
        let busy = AtomicBool::new(true);
        for expected in [1, 2, 4, 8, 16, 30, 30] {
            let result = worker.drain(&pending, || {
                busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).map(|_| ()).map_err(|_| "busy".into())
            });
            assert_eq!(result.unwrap().0, expected);
            assert!(pending.load(Ordering::Acquire));
        }
        busy.store(false, Ordering::Release);
        worker.drain(&pending, || Ok(()));
        assert_eq!(worker.retry, 1);
        assert!(!pending.load(Ordering::Acquire));
    }
    #[test]
    fn heartbeat_and_echo_do_not_signal() {
        assert!(!advanced_notice(false, 8, 7));
        assert!(!advanced_notice(true, 8, 8));
        assert!(advanced_notice(true, 9, 8));
    }
    #[test]
    fn pause_during_credentials_and_resume_reject_old_page() {
        let gate = std::sync::Mutex::new(());
        let enabled = std::cell::Cell::new(true);
        let epoch = std::cell::Cell::new(1);
        let captured = epoch.get();
        // Credential access returns only after pause and resume occurred.
        enabled.set(false); epoch.set(2);
        let calls = std::cell::Cell::new(0);
        let dispatch = || { calls.set(calls.get() + 1); Ok(()) };
        assert!(with_admission(&gate, || enabled.get() && epoch.get() == captured, dispatch).is_err());
        enabled.set(true);
        assert!(with_admission(&gate, || enabled.get() && epoch.get() == captured, dispatch).is_err());
        assert_eq!(calls.get(), 0);
        assert!(with_admission(&gate, || enabled.get() && epoch.get() == 2, dispatch).is_ok());
    }
    #[test]
    fn lifecycle_waits_for_admitted_dispatch() {
        let gate = std::sync::Arc::new(std::sync::Mutex::new(()));
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (finish_tx, finish_rx) = std::sync::mpsc::channel();
        let request_gate = gate.clone();
        let request = std::thread::spawn(move || with_admission(&request_gate, || true, || {
            started_tx.send(()).unwrap(); finish_rx.recv().unwrap(); Ok(())
        }));
        started_rx.recv().unwrap();
        assert!(gate.try_lock().is_err());
        finish_tx.send(()).unwrap();
        request.join().unwrap().unwrap();
        assert!(gate.try_lock().is_ok());
    }
    #[test]
    fn stale_admission_never_dispatches() {
        let gate = std::sync::Mutex::new(());
        let called = std::cell::Cell::new(false);
        let result = with_admission(&gate, || false, || { called.set(true); Ok(()) });
        assert!(result.is_err()); assert!(!called.get());
    }
}

#[cfg(test)]
mod authorization_regression_tests {
    use super::*;
    fn fixture() -> (std::sync::Mutex<crate::store::Store>, Credential, AtomicU64) {
        let mut store = crate::store::Store::memory().unwrap();
        store.sync_link("auth-fixture").unwrap();
        let license = LicenseStatus {account_id:"auth-fixture".into(), code_hint:"fixture".into(), expires_at:"2099-01-01T00:00:00Z".into(), device_limit:3, devices_used:1};
        store.sync_cache_license(Some(&license)).unwrap();
        store.save_task(serde_json::from_value(serde_json::json!({"title":"preserved fixture task","description":"retained activity data","priority":"med","status":"todo"})).unwrap()).unwrap();
        let mut settings = store.snapshot().unwrap().settings;
        settings.pet = "fox".into();
        store.set_settings(settings).unwrap();
        (std::sync::Mutex::new(store), Credential {account:"auth-fixture".into(),token:"fixture-token-preserved".into(),license:Some(license)}, AtomicU64::new(10))
    }
    #[test]
    fn paused_sync_decomposition_rejection_locks_looks_without_changing_local_data() {
        for error in ["此电脑的授权已失效或已停用，请重新激活授权","授权已到期或已停用，请检查授权；本机任务仍保留"] {
            let (store,credential,epoch) = fixture();
            let before = serde_json::to_value(store.lock().unwrap().snapshot().unwrap()).unwrap();
            let identity = store.lock().unwrap().local_identity().unwrap().user_id;
            assert!(!store.lock().unwrap().sync_status().unwrap().enabled);
            let notified = std::cell::Cell::new(false);
            let result = decompose_with(&store,&epoch,10,&credential,"拆解测试".into(),480, |body| {
                assert_eq!(body["content"],"拆解测试");
                Err(error.into())
            }, |snapshot| { notified.set(true); assert!(snapshot.looks_expires_at.is_none()); });
            assert!(result.is_err());
            let store = store.lock().unwrap();
            assert!(store.require_look("fox").is_err());
            assert!(notified.get());
            assert_eq!(store.local_identity().unwrap().user_id,identity);
            let after=serde_json::to_value(store.snapshot().unwrap()).unwrap();
            assert_eq!(before["tasks"],after["tasks"]);
            assert_eq!(before["settings"],after["settings"]);
            assert_eq!(credential.token,"fixture-token-preserved");
            crate::sync_credentials::restore_summary(&store,Ok(Some(credential))).unwrap();
            assert!(store.require_look("fox").is_err());
        }
    }
    #[test]
    fn wait_rejection_between_status_response_and_commit_prevents_resurrection() {
        let (store,credential,epoch) = fixture();
        store.lock().unwrap().sync_enable().unwrap();
        let status_license = authenticated_call(&store,&epoch,10,&credential,true,|| Ok(credential.license.clone().unwrap()), |_| {}).unwrap();
        let result: Result<()> = authenticated_call(&store,&epoch,10,&credential,true,|| Err("此电脑的授权已失效或已停用，请重新激活授权".into()), |_| {});
        assert!(result.is_err());
        let store=store.lock().unwrap();
        let cached = cache_license_if_current(&store,&epoch,10,&credential.account,&status_license).unwrap();
        assert!(!cached,"a status success preceding revocation must not replace the rejection marker");
        assert!(store.require_look("panda").is_err());
    }
    #[test]
    fn paused_decomposition_transport_errors_and_old_auth_responses_keep_activation() {
        for error in ["同步服务暂时无法连接，任务已保存在本机；联网后会重试","同步服务暂不可用（503），本地任务仍保留"] {
            let (store,credential,epoch)=fixture();
            let response=decompose_with(&store,&epoch,10,&credential,"测试".into(),480, |_| Err(error.into()), |_| panic!("offline responses must not broadcast entitlement changes"));
            assert!(response.is_err());
            assert!(store.lock().unwrap().require_look("fox").is_ok());
            assert_eq!(epoch.load(Ordering::Acquire),10);
        }
        let (store,credential,epoch)=fixture();
        let renewed=credential.license.clone().unwrap();
        let response=decompose_with(&store,&epoch,10,&credential,"测试".into(),480, |_| {
            // Renewal occurs while the old transport response is outstanding.
            let store=store.lock().unwrap();
            epoch.fetch_add(1,Ordering::AcqRel);
            store.sync_cache_license(Some(&renewed)).unwrap();
            Err("此电脑的授权已失效或已停用，请重新激活授权".into())
        }, |_| panic!("stale errors must not broadcast fallback"));
        assert!(response.is_err());
        assert!(store.lock().unwrap().require_look("fox").is_ok());
        assert_eq!(epoch.load(Ordering::Acquire),11);
    }
    #[test]
    fn paused_decomposition_success_uses_transport_without_sync_consent() {
        let (store,credential,epoch)=fixture();
        let result=decompose_with(&store,&epoch,10,&credential,"测试".into(),480, |_| Ok(serde_json::json!({"tasks":["第一步"]})), |_| panic!("success must preserve entitlement"));
        assert_eq!(result.unwrap()["tasks"][0],"第一步");
        assert!(store.lock().unwrap().require_look("fox").is_ok());
        assert!(!store.lock().unwrap().sync_status().unwrap().enabled);
    }

}
