mod updates;
mod export;
mod notifications;
mod reminders;
mod store;
mod looks;
mod sync_store;
mod sync_http;
mod sync_credentials;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod reminder_revision_tests;
mod windows;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use store::{Result, Snapshot, Store, TaskInput};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition,
};

use chrono::Local;
use tauri_plugin_dialog::DialogExt;
use serde::Deserialize;
struct AppState(Mutex<Store>, AtomicBool);
fn locked(app: &tauri::AppHandle) -> Result<tauri::State<'_, AppState>> {
    Ok(app.state::<AppState>())
}
fn broadcast(app: &tauri::AppHandle, s: &Store) -> Result<Snapshot> {
    let snapshot = s.snapshot()?;
    if let Err(e) = app.emit("snapshot", &snapshot) {
        eprintln!("刷新窗口失败，数据已保存: {e}")
    }
    Ok(snapshot)
}
#[tauri::command]
fn get_snapshot(app: tauri::AppHandle) -> Result<Snapshot> {
    let state = locked(&app)?;
    let s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.snapshot()
}
#[tauri::command]
fn sync_status(app: tauri::AppHandle) -> Result<sync_store::SyncStatus> {sync_http::status(&app)}
#[tauri::command]
async fn activate_license(app: tauri::AppHandle, code: String) -> Result<sync_store::SyncStatus> {
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || sync_http::activate(&app, &code)).await.map_err(|e|e.to_string())??;
    let state = locked(&handle)?;
    let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    broadcast(&handle, &store)?;
    Ok(result)
}
#[tauri::command]
async fn pause_sync(app: tauri::AppHandle) -> Result<sync_store::SyncStatus> { tauri::async_runtime::spawn_blocking(move || sync_http::pause(&app)).await.map_err(|e| e.to_string())? }
#[tauri::command]
async fn enable_sync(app: tauri::AppHandle)->Result<sync_store::SyncStatus>{
    let current = sync_http::status(&app)?;
    if !current.bound { return Err("请先激活授权".into()); }
    {let state=app.state::<AppState>();let store=state.0.lock().map_err(|_|"数据库暂不可用")?;store.sync_enable()?;}
    sync_now(app).await
}
#[tauri::command]
async fn sync_now(app: tauri::AppHandle)->Result<sync_store::SyncStatus>{tauri::async_runtime::spawn_blocking(move||sync_http::synchronize(&app)).await.map_err(|e|e.to_string())?}
#[tauri::command]
async fn deactivate_license(app: tauri::AppHandle)->Result<()> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move||sync_http::deactivate(&app)).await.map_err(|e|e.to_string())??;
    let state = locked(&handle)?;
    let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    broadcast(&handle, &store)?;
    Ok(())
}
#[tauri::command]
fn resolve_sync_conflict(app:tauri::AppHandle,id:String,keep_local:bool)->Result<Snapshot>{let state=app.state::<AppState>();let mut store=state.0.lock().map_err(|_|"数据库暂不可用")?;store.sync_resolve(&id,keep_local)?;sync_http::signal();broadcast(&app,&store)}
#[tauri::command]
async fn decompose_tasks(app:tauri::AppHandle,content:String,utc_offset_minutes:i32)->Result<serde_json::Value>{tauri::async_runtime::spawn_blocking(move||sync_http::decompose(&app,content,utc_offset_minutes)).await.map_err(|e|e.to_string())?}
#[tauri::command]
fn save_task(app: tauri::AppHandle, input: TaskInput) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    let t = s.save_task(input)?;
    if t.status == "completed" {
        let _ = app.emit("celebrate", ());
    }
    sync_http::signal();
    broadcast(&app, &s)
}
#[tauri::command]
fn save_tasks(app:tauri::AppHandle,inputs:Vec<TaskInput>)->Result<Snapshot>{let state=locked(&app)?;let mut store=state.0.lock().map_err(|_|"数据库暂不可用")?;store.save_tasks(inputs)?;sync_http::signal();broadcast(&app,&store)}
#[tauri::command]
fn delete_task(app: tauri::AppHandle, id: String) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    store.delete_task(&id)?;
    sync_http::signal();
    broadcast(&app, &store)
}
#[tauri::command]
async fn export_tasks(app: tauri::AppHandle) -> Result<Option<String>> {
    let snapshot = {
        let state = locked(&app)?;
        let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
        store.snapshot()?
    };
    app.state::<AppState>().1.store(true, Ordering::Relaxed);
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let parent = app.get_webview_window("panel").ok_or("任务面板不可用")?;
        let file = app.dialog().file()
            .set_parent(&parent)
            .set_title("导出全部任务")
            .add_filter("CSV 文件", &["csv"])
            .set_file_name(format!("Task-Sprite-任务-{}.csv", Local::now().format("%Y-%m-%d-%H%M%S")))
            .blocking_save_file();
        let Some(file) = file else { return Ok(None); };
        let path = file.into_path().map_err(|e| e.to_string())?;
        std::fs::write(&path, export::tasks_csv(&snapshot)).map_err(|e| format!("导出失败：{e}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|e| e.to_string());
    handle.state::<AppState>().1.store(false, Ordering::Relaxed);
    result?
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    pet: Option<String>,
    skin: Option<String>,
    notifications: Option<bool>,
    summary_time: Option<String>,
    quiet_start: Option<String>,
    quiet_end: Option<String>,
    reduce_motion: Option<bool>,
    show_hint: Option<bool>,
    theme: Option<String>,
    panel_pinned: Option<bool>,
    card_pinned: Option<bool>,
}
#[tauri::command]
fn update_preferences(app: tauri::AppHandle, patch: Preferences) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    let mut st = s.snapshot()?.settings;
    let pin_changed = patch.panel_pinned.is_some_and(|pinned| pinned != st.panel_pinned);
    if let Some(v) = patch.pet {
        s.require_look(&v)?;
        st.pet = v
    }
    if let Some(v) = patch.skin {
        if v != "default" { s.require_look(&v)?; }
        st.skin = v;
    }
    if let Some(v) = patch.notifications {
        st.notifications = v
    }
    if let Some(v) = patch.summary_time {
        st.summary_time = v
    }
    if let Some(v) = patch.quiet_start {
        st.quiet_start = v
    }
    if let Some(v) = patch.quiet_end {
        st.quiet_end = v
    }
    if let Some(v) = patch.reduce_motion {
        st.reduce_motion = v
    }
    if let Some(v) = patch.show_hint {
        st.show_hint = v
    }
    if let Some(v) = patch.theme {
        st.theme = v;
    }
    if let Some(v) = patch.panel_pinned { st.panel_pinned = v; }
    if let Some(v) = patch.card_pinned { st.card_pinned = v; }
    s.set_settings(st)?;
    let snapshot = broadcast(&app, &s)?;
    drop(s);
    if pin_changed {
        panel_interaction(app.clone());
    }
    Ok(snapshot)
}
#[tauri::command]
fn set_focus(app: tauri::AppHandle, id: Option<String>) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.set_focus(id)?;
    sync_http::signal();
    broadcast(&app, &s)
}
#[tauri::command]
fn pause_task(app: tauri::AppHandle, id: String) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.pause_task(&id)?;
    sync_http::signal();
    broadcast(&app, &s)
}
#[tauri::command]
fn set_task_execution(app: tauri::AppHandle, id: String, state: String) -> Result<Snapshot> {
    let handle = locked(&app)?;
    let mut store = handle.0.lock().map_err(|_| "数据库暂不可用")?;
    store.set_task_execution(&id, &state)?;
    sync_http::signal();
    broadcast(&app, &store)
}
#[tauri::command]
fn append_task_step(app: tauri::AppHandle, id: String, content: String) -> Result<Snapshot> {
    let handle = locked(&app)?;
    let mut store = handle.0.lock().map_err(|_| "数据库暂不可用")?;
    store.append_task_step(&id, &content)?;
    sync_http::signal();
    broadcast(&app, &store)
}
#[tauri::command]
fn delete_task_step(app: tauri::AppHandle, id: String, step_id: String) -> Result<Snapshot> {
    let handle = locked(&app)?;
    let mut store = handle.0.lock().map_err(|_| "数据库暂不可用")?;
    store.delete_task_step(&id, &step_id)?;
    broadcast(&app, &store)
}
#[tauri::command]
fn panel_interaction(app: tauri::AppHandle) {
    if let Ok(mut lifecycle) = app.state::<Mutex<windows::PanelLifecycle>>().lock() {
        lifecycle.interact();
    }
}
fn panel_pinned(app: &tauri::AppHandle) -> bool {
    app.state::<AppState>().0.lock().ok().and_then(|s| s.snapshot().ok())
        .is_some_and(|s| s.settings.panel_pinned)
}
fn dismiss_panel_on_outside(app: &tauri::AppHandle) {
    let visible = app.get_webview_window("panel").is_some_and(|w| w.is_visible().unwrap_or(false));
    if visible && windows::hide_on_blur(panel_pinned(app), app.state::<AppState>().1.load(Ordering::Relaxed)) {
        let _ = hide_task_panel(app);
    }
}
#[cfg(target_os = "macos")]
fn install_outside_click_monitor(app: &tauri::AppHandle) {
    use objc2_app_kit::{NSEvent, NSEventMask};
    let handle = app.clone();
    let callback = block2::RcBlock::new(move |_event: std::ptr::NonNull<NSEvent>| {
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || dismiss_panel_on_outside(&app));
    });
    let mask = NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown | NSEventMask::OtherMouseDown;
    if let Some(monitor) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &callback) {
        // This app-lifetime mouse monitor is released with the process.
        std::mem::forget(monitor);
    }
}
#[tauri::command]
fn snooze(app: tauri::AppHandle, id: String, minutes: i64) -> Result<()> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.snooze(&id, minutes, Local::now().fixed_offset())
}
fn monitor_rect(app: &tauri::AppHandle, p: windows::Rect) -> Result<windows::Rect> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let rects: Vec<_> = monitors
        .iter()
        .map(|m| {
            let a = m.work_area();
            let f = m.scale_factor();
            windows::Rect {
                x: a.position.x as f64 / f,
                y: a.position.y as f64 / f,
                w: a.size.width as f64 / f,
                h: a.size.height as f64 / f,
            }
        })
        .collect();
    rects
        .iter()
        .find(|r| {
            p.x + p.w / 2. >= r.x
                && p.x + p.w / 2. < r.x + r.w
                && p.y + p.h / 2. >= r.y
                && p.y + p.h / 2. < r.y + r.h
        })
        .or(rects.first())
        .copied()
        .ok_or("无法获取屏幕区域".into())
}
fn pet_rect(app: &tauri::AppHandle) -> Result<windows::Rect> {
    let w = app.get_webview_window("pet").ok_or("窗口不存在")?;
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    let p = w.outer_position().map_err(|e| e.to_string())?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    Ok(windows::Rect {
        x: p.x as f64 / scale,
        y: p.y as f64 / scale,
        w: size.width as f64 / scale,
        h: size.height as f64 / scale,
    })
}
#[cfg(target_os = "macos")]
fn menu_panel_position(app: &tauri::AppHandle) -> Result<windows::Rect> {
    let panel = app.get_webview_window("panel").ok_or("窗口不存在")?;
    let height = panel.outer_size().map_err(|e| e.to_string())?.height as f64 / panel.scale_factor().map_err(|e| e.to_string())?;
    let tray = app.tray_by_id("main").ok_or("菜单栏图标不可用")?;
    tray.with_inner_tray_icon(move |tray| -> Result<windows::Rect> {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSScreen;
        let mtm = MainThreadMarker::new().ok_or("窗口操作需在主线程执行")?;
        let status = tray.ns_status_item().ok_or("菜单栏图标不可用")?;
        let button = status.button(mtm).ok_or("菜单栏图标不可用")?;
        let window = button.window().ok_or("无法获取菜单栏位置")?;
        let screen = window.screen().ok_or("无法获取菜单栏所在屏幕")?;
        let screens = NSScreen::screens(mtm);
        let primary = screens.firstObject().ok_or("无法获取主屏幕")?;
        let anchor = window.frame();
        let visible = screen.visibleFrame();
        Ok(windows::cocoa_menu_position(
            primary.frame().size.height,
            windows::Rect { x: anchor.origin.x, y: anchor.origin.y, w: anchor.size.width, h: anchor.size.height },
            windows::Rect { x: visible.origin.x, y: visible.origin.y, w: visible.size.width, h: visible.size.height },
            height,
        ))
    }).map_err(|e| e.to_string())?
}
fn place_panel(app: &tauri::AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    let r = menu_panel_position(app)?;
    #[cfg(not(target_os = "macos"))]
    let r = {
        let pet = pet_rect(app)?;
        let area = monitor_rect(app, pet)?;
        let panel = app.get_webview_window("panel").ok_or("窗口不存在")?;
        let height = panel.outer_size().map_err(|e| e.to_string())?.height as f64 / panel.scale_factor().map_err(|e| e.to_string())?;
        let (placed_pet, panel) = windows::panel_layout(pet, area, height);
        if placed_pet.x != pet.x || placed_pet.y != pet.y {
            app.get_webview_window("pet").ok_or("窗口不存在")?
                .set_position(LogicalPosition::new(placed_pet.x, placed_pet.y)).map_err(|e| e.to_string())?;
        }
        panel
    };
    if let Some(w) = app.get_webview_window("panel") {
        w.set_size(LogicalSize::new(r.w, r.h))
            .map_err(|e| e.to_string())?;
        w.set_position(LogicalPosition::new(r.x, r.y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn resize_panel(app: tauri::AppHandle, height: Option<f64>) -> Result<f64> {
    let window = app.get_webview_window("panel").ok_or("窗口不存在")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let rect = windows::Rect { x:position.x as f64 / scale, y:position.y as f64 / scale, w:size.width as f64 / scale, h:size.height as f64 / scale };
    let area = monitor_rect(&app, rect)?;
    if let Some(height) = height {
        if !height.is_finite() || height <= 0. { return Err("窗口高度无效".into()); }
        let next = windows::fitted_panel(rect, height, area, cfg!(not(target_os = "macos")));
        window.set_size(LogicalSize::new(next.w,next.h)).map_err(|e| e.to_string())?;
        window.set_position(LogicalPosition::new(next.x,next.y)).map_err(|e| e.to_string())?;
    }
    Ok(740_f64.min(area.h))
}
fn show_panel(app: &tauri::AppHandle) -> Result<()> {
    panel_interaction(app.clone());
    place_panel(app)?;
    if let Some(w) = app.get_webview_window("panel") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        app.emit("panel-visibility", true).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn show_panel_from_tray(
    app: &tauri::AppHandle,
    _rect: tauri::Rect,
    _point: PhysicalPosition<f64>,
) -> Result<()> {
    panel_interaction(app.clone());
    let panel = app.get_webview_window("panel").ok_or("窗口不存在")?;
    if panel.is_visible().map_err(|e| e.to_string())? {
        return hide_task_panel(app);
    }
    #[cfg(target_os = "macos")]
    {
        show_panel(app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let r = {
            let monitors = app.available_monitors().map_err(|e| e.to_string())?;
            let monitor = monitors
                .iter()
                .find(|m| {
                    let p = m.position();
                    let z = m.size();
                    _point.x >= p.x as f64
                        && _point.x < p.x as f64 + z.width as f64
                        && _point.y >= p.y as f64
                        && _point.y < p.y as f64 + z.height as f64
                })
                .or(monitors.first())
                .ok_or("无法获取屏幕区域")?;
            let scale = monitor.scale_factor();
            let at = _rect.position.to_logical::<f64>(scale);
            let size = _rect.size.to_logical::<f64>(scale);
            let area = monitor.work_area();
            windows::clamp(
                windows::Rect {
                    x: at.x + size.width / 2. - 220.,
                    y: at.y + size.height + 8.,
                    w: 440.,
                    h: panel.outer_size().map_err(|e| e.to_string())?.height as f64 / panel.scale_factor().map_err(|e| e.to_string())?,
                },
                windows::Rect {
                    x: area.position.x as f64 / scale,
                    y: area.position.y as f64 / scale,
                    w: area.size.width as f64 / scale,
                    h: area.size.height as f64 / scale,
                },
            )
        };
        if let Ok(pet) = pet_rect(app) {
            if !windows::panel_clear_of_pet(r, pet) {
                return show_panel(app);
            }
        }
        if let Some(w) = app.get_webview_window("panel") {
            w.set_size(LogicalSize::new(r.w, r.h))
                .map_err(|e| e.to_string())?;
            w.set_position(LogicalPosition::new(r.x, r.y))
                .map_err(|e| e.to_string())?;
            w.show().map_err(|e| e.to_string())?;
            w.set_focus().map_err(|e| e.to_string())?;
            app.emit("panel-visibility", true).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
fn toggle_panel(app: tauri::AppHandle) -> Result<()> {
    let w = app.get_webview_window("panel").ok_or("窗口不存在")?;
    if w.is_visible().map_err(|e| e.to_string())? {
        hide_task_panel(&app)
    } else {
        show_panel(&app)
    }
}
#[tauri::command]
fn get_pet_position(app: tauri::AppHandle) -> Result<(f64, f64)> {
    let r = pet_rect(&app)?;
    Ok((r.x, r.y))
}
#[tauri::command]
fn resize_pet(app: tauri::AppHandle, height: f64) -> Result<()> {
    if !height.is_finite() || !(230. ..=2000.).contains(&height) {
        return Err("卡片高度无效".into());
    }
    let p = pet_rect(&app)?;
    if (p.h - height).abs() < 1. { return Ok(()); }
    let area = monitor_rect(&app, p)?;
    let r = windows::resized_pet(p, height, area);
    let w = app.get_webview_window("pet").ok_or("窗口不存在")?;
    w.set_size(LogicalSize::new(r.w, r.h)).map_err(|e| e.to_string())?;
    w.set_position(LogicalPosition::new(r.x, r.y)).map_err(|e| e.to_string())
}
#[tauri::command]
fn move_pet(app: tauri::AppHandle, x: f64, y: f64) -> Result<()> {
    if !x.is_finite() || !y.is_finite() {
        return Err("窗口位置无效".into());
    }
    let p = windows::Rect { x, y, ..pet_rect(&app)? };
    let a = monitor_rect(&app, p)?;
    let r = windows::clamp(p, a);
    app.get_webview_window("pet")
        .ok_or("窗口不存在")?
        .set_position(LogicalPosition::new(r.x, r.y))
        .map_err(|e| e.to_string())
}
fn hide_task_panel(app: &tauri::AppHandle) -> Result<()> {
    panel_interaction(app.clone());
    app.get_webview_window("panel")
        .ok_or("窗口不存在")?
        .hide()
        .map_err(|e| e.to_string())?;
    app.emit("panel-visibility", false).map_err(|e| e.to_string())
}
#[tauri::command]
fn hide_panel(app: tauri::AppHandle) -> Result<()> {
    hide_task_panel(&app)
}
#[tauri::command]
fn open_website() -> Result<()> {
    let opener = if cfg!(target_os = "macos") { "open" } else if cfg!(target_os = "windows") { "explorer" } else { "xdg-open" };
    std::process::Command::new(opener).arg("https://tbtparent.me").spawn()
        .map(|_| ()).map_err(|e| format!("无法打开浏览器：{e}"))
}
#[tauri::command]
fn is_panel_visible(app: tauri::AppHandle) -> Result<bool> {
    app.get_webview_window("panel")
        .ok_or("窗口不存在")?
        .is_visible()
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn request_notifications(app: tauri::AppHandle) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = notifications::request(&app);
        if let Ok(status) = &result {
            let _ = app.emit("notification-status", status);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn test_notification(app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        notifications::send(&app, "提醒已准备好。接下来，一起专注完成一件事。")
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn notification_status(app: tauri::AppHandle) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || notifications::status(&app))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0)
}
fn show_reminder_panel(app: &tauri::AppHandle) -> Result<()> {
    let panel = app.get_webview_window("panel").ok_or("窗口不存在")?;
    let visible = panel.is_visible().map_err(|e| e.to_string())?;
    let pinned = panel_pinned(app);
    if visible { return Ok(()); }
    let use_card={
        let state=app.state::<AppState>();let store=state.0.lock().map_err(|_| "数据库暂不可用")?;
        let snapshot=store.snapshot()?;
        let pet_visible=app.get_webview_window("pet").is_some_and(|pet|pet.is_visible().unwrap_or(false));
        windows::reminder_uses_card(cfg!(target_os="windows"),snapshot.settings.card_pinned,pet_visible,snapshot.tasks.iter().any(|t|t.status=="todo"))
    };
    if use_card { return Ok(()); }
    place_panel(app)?;
    let token = app.state::<Mutex<windows::PanelLifecycle>>().lock()
        .map_err(|_| "窗口状态暂不可用")?.open_reminder(visible, pinned);
    // AppKit's orderFrontRegardless shows the existing panel without making it key.
    #[cfg(target_os = "macos")]
    {
        let ptr = panel.ns_window().map_err(|e| e.to_string())?;
        let native = unsafe { &*ptr.cast::<objc2_app_kit::NSWindow>() };
        native.orderFrontRegardless();
    }
    #[cfg(not(target_os = "macos"))]
    {
        panel.set_focusable(false).map_err(|e| e.to_string())?;
        let shown = panel.show().map_err(|e| e.to_string());
        let _ = panel.set_focusable(true);
        shown?;
    }
    app.emit("panel-visibility", true).map_err(|e| e.to_string())?;
    if let Some(token) = token {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(20));
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                let pinned = panel_pinned(&app);
                let exporting = app.state::<AppState>().1.load(Ordering::Relaxed);
                let close = app.state::<Mutex<windows::PanelLifecycle>>().lock()
                    .map(|state| state.should_close(token, pinned, exporting)).unwrap_or(false);
                if close { let _ = hide_task_panel(&app); }
            });
        });
    }
    Ok(())
}
fn tick(app: &tauri::AppHandle) {
    let planned = {
        let state = app.state::<AppState>();
        let Ok(store) = state.0.lock() else { return };
        reminders::plan(&store, Local::now().fixed_offset())
    };
    match planned {
        Ok(Some(notice)) => {
            let handle = app.clone();
            // The UI callback acquires the store only after the planning guard was dropped.
            if let Err(e) = app.run_on_main_thread(move || {
                if let Err(e) = show_reminder_panel(&handle) {
                    let _ = handle.emit("notification-warning", e);
                    return;
                }
                let _ = handle.emit("reminder-tasks", &notice.task_ids);
                let _ = handle.emit("reminder", ());
                if let Ok(mut store) = handle.state::<AppState>().0.lock() {
                    if let Err(e) = store.record_delivery(&notice) {
                        let _ = handle.emit("notification-warning", e);
                    }
                }
                // OS permission denial must never suppress the in-app reminder.
                let notify = handle.clone();
                std::thread::spawn(move || {
                    if let Err(e) = notifications::send(&notify, &notice.body) {
                        let _ = notify.emit("notification-warning", e);
                    }
                });
            }) { let _ = app.emit("notification-warning", e.to_string()); }
        }
        Err(e) => { let _ = app.emit("notification-warning", e); }
        _ => {}
    }
}
fn restore_pet(app: &tauri::AppHandle) -> Result<()> {
    let st = app
        .state::<AppState>()
        .0
        .lock()
        .map_err(|_| "数据库暂不可用")?
        .snapshot()?
        .settings;
    let current = pet_rect(app)?;
    let default = windows::Rect {
        x: st.pet_x.unwrap_or(99999.),
        y: st.pet_y.unwrap_or(99999.) + 230. - current.h,
        ..current
    };
    let a = monitor_rect(app, default)?;
    let p = if st.pet_x.is_none() {
        windows::Rect {
            x: a.x + a.w - default.w,
            y: a.y + a.h - default.h - 20.,
            ..default
        }
    } else {
        default
    };
    let r = windows::clamp(p, a);
    let w = app.get_webview_window("pet").ok_or("窗口不存在")?;
    w.set_position(LogicalPosition::new(r.x, r.y))
        .map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = restore_pet(app);
            let _ = show_panel(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            updates::check_update, updates::install_update,
            sync_status,activate_license,pause_sync,enable_sync,sync_now,deactivate_license,resolve_sync_conflict,
            decompose_tasks,
            save_task,
            save_tasks,
            delete_task,
            export_tasks,
            update_preferences,
            set_focus,
            pause_task,
            set_task_execution,
            append_task_step,
            delete_task_step,
            panel_interaction,
            snooze,
            toggle_panel,
            hide_panel,
            open_website,
            is_panel_visible,
            get_pet_position,
            move_pet,
            resize_pet,
            resize_panel,
            request_notifications,
            test_notification,
            notification_status,
            quit
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            sync_credentials::initialize(app.path().resource_dir()?.join("task-sprite-credential-agent"));
            let store = Store::open(&dir.join("tasks.sqlite3")).map_err(std::io::Error::other)?;
            // Upgrade legacy activation even when the new protected store has no credential yet.
            if store.sync_status().map(|status| !status.bound).unwrap_or(false) {
                let _ = sync_credentials::restore_summary(&store, sync_credentials::read());
            }
            app.manage(AppState(Mutex::new(store), AtomicBool::new(false)));
            app.manage(Mutex::new(windows::PanelLifecycle::default()));
            app.manage(sync_http::SyncRuntime(AtomicBool::new(false)));
            sync_http::start_workers(app.handle().clone());
            let show = MenuItem::with_id(app, "show", "打开任务面板", true, None::<&str>)?;
            let pet = MenuItem::with_id(app, "pet", "显示 / 隐藏精灵", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Task Sprite", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pet, &quit])?;
            TrayIconBuilder::with_id("main")
                .tooltip("Task Sprite · 桌面任务伙伴")
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray-template.png"
                ))?)
                .icon_as_template(true)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        position,
                        ..
                    } = event
                    {
                        let _ = show_panel_from_tray(tray.app_handle(), rect, position);
                    }
                })
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        let _ = restore_pet(app);
                        let _ = show_panel(app);
                    }
                    "pet" => {
                        if let Some(w) = app.get_webview_window("pet") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = restore_pet(app);
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            #[cfg(target_os = "macos")]
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.with_inner_tray_icon(|tray| {
                    if let Some(mtm) = objc2::MainThreadMarker::new() {
                        if let Some(status) = tray.ns_status_item() {
                            status.setLength(28.);
                            if let Some(button) = status.button(mtm) {
                                if let Some(image) = button.image() {
                                    image.setSize(objc2_foundation::NSSize::new(22., 22.));
                                    image.setTemplate(true);
                                    button.setImage(Some(&image));
                                }
                            }
                        }
                    }
                });
            }
            if let Some(w) = app.get_webview_window("pet") {
                w.set_focusable(false)?;
                w.set_visible_on_all_workspaces(true)?;
            }
            if let Some(w) = app.get_webview_window("panel") {
                w.set_visible_on_all_workspaces(true)?;
            }
            #[cfg(target_os = "macos")]
            install_outside_click_monitor(app.handle());
            notifications::initialize(app.handle());
            restore_pet(app.handle()).map_err(std::io::Error::other)?;
            if panel_pinned(app.handle()) { show_panel(app.handle()).map_err(std::io::Error::other)?; }
            let h = app.handle().clone();
            std::thread::spawn(move || loop {
                tick(&h);
                let hc = h.clone();
                let _ = h.run_on_main_thread(move || {
                    if let Ok(p) = pet_rect(&hc) {
                        if let Ok(a) = monitor_rect(&hc, p) {
                            let r = windows::clamp(p, a);
                            if r.x != p.x || r.y != p.y {
                                if let Some(w) = hc.get_webview_window("pet") {
                                    let _ = w.set_position(LogicalPosition::new(r.x, r.y));
                                }
                            }
                        }
                    }
                    let _ = hc.emit("clock", ());
                });
                std::thread::sleep(std::time::Duration::from_secs(30));
            });
            Ok(())
        })
        .on_window_event(|w, event| match event {
            tauri::WindowEvent::Focused(true) if w.label() == "panel" => {
                panel_interaction(w.app_handle().clone());
            }
            tauri::WindowEvent::Focused(false) if w.label() == "panel" => {
                // A native export sheet temporarily takes focus from its parent window.
                dismiss_panel_on_outside(w.app_handle());
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if w.label() == "panel" {
                    let _ = hide_task_panel(w.app_handle());
                } else {
                    let _ = w.hide();
                }
            }
            tauri::WindowEvent::Moved(PhysicalPosition { x, y }) if w.label() == "pet" => {
                if let Ok(scale) = w.scale_factor() {
                    let state = w.app_handle().state::<AppState>();
                    if let Ok(mut s) = state.0.lock() {
                        if let Ok(snap) = s.snapshot() {
                            let mut st = snap.settings;
                            st.pet_x = Some(*x as f64 / scale);
                            let height = w.outer_size().map(|size| size.height as f64 / scale).unwrap_or(230.);
                            st.pet_y = Some(*y as f64 / scale + height - 230.);
                            let _ = s.set_settings(st);
                        }
                    };
                }
                #[cfg(not(target_os = "macos"))]
                if let Some(panel) = w.app_handle().get_webview_window("panel") {
                    if panel.is_visible().unwrap_or(false) { let _ = place_panel(w.app_handle()); }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Task Sprite 无法启动，请检查本地数据目录与系统权限");
}
