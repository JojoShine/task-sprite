mod export;
mod notifications;
mod reminders;
mod store;
#[cfg(test)]
mod tests;
mod windows;
use std::sync::Mutex;
use store::{Result, Snapshot, Store, TaskInput};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition,
};

use chrono::Local;
use tauri_plugin_dialog::DialogExt;
use serde::Deserialize;
struct AppState(Mutex<Store>);
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
fn get_local_identity(app: tauri::AppHandle) -> Result<store::LocalIdentity> {
    let state = locked(&app)?;
    let s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.local_identity()
}
#[tauri::command]
fn save_task(app: tauri::AppHandle, input: TaskInput) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    let t = s.save_task(input)?;
    if t.status == "completed" {
        let _ = app.emit("celebrate", ());
    }
    broadcast(&app, &s)
}
#[tauri::command]
fn delete_task(app: tauri::AppHandle, id: String) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut store = state.0.lock().map_err(|_| "数据库暂不可用")?;
    store.delete_task(&id)?;
    broadcast(&app, &store)
}
#[tauri::command]
async fn export_tasks(app: tauri::AppHandle) -> Result<Option<String>> {
    let snapshot = {
        let state = locked(&app)?;
        let store = state.0.lock().map_err(|_| "数据库暂不可用")?;
        store.snapshot()?
    };
    tauri::async_runtime::spawn_blocking(move || {
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
    }).await.map_err(|e| e.to_string())?
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    pet: Option<String>,
    notifications: Option<bool>,
    summary_time: Option<String>,
    quiet_start: Option<String>,
    quiet_end: Option<String>,
    reduce_motion: Option<bool>,
    show_hint: Option<bool>,
    theme: Option<String>,
}
#[tauri::command]
fn update_preferences(app: tauri::AppHandle, patch: Preferences) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    let mut st = s.snapshot()?.settings;
    if let Some(v) = patch.pet {
        st.pet = v
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
    s.set_settings(st)?;
    broadcast(&app, &s)
}
#[tauri::command]
fn set_focus(app: tauri::AppHandle, id: Option<String>) -> Result<Snapshot> {
    let state = locked(&app)?;
    let mut s = state.0.lock().map_err(|_| "数据库暂不可用")?;
    s.set_focus(id)?;
    broadcast(&app, &s)
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
        .map(windows::right_inset)
        .ok_or("无法获取屏幕区域".into())
}
fn pet_rect(app: &tauri::AppHandle) -> Result<windows::Rect> {
    let w = app.get_webview_window("pet").ok_or("窗口不存在")?;
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    let p = w.outer_position().map_err(|e| e.to_string())?;
    Ok(windows::Rect {
        x: p.x as f64 / scale,
        y: p.y as f64 / scale,
        w: 300.,
        h: 230.,
    })
}
fn place_panel(app: &tauri::AppHandle) -> Result<()> {
    let pet = pet_rect(app)?;
    let a = monitor_rect(app, pet)?;
    let (placed_pet, r) = windows::panel_layout(pet, a);
    if placed_pet.x != pet.x || placed_pet.y != pet.y {
        app.get_webview_window("pet").ok_or("窗口不存在")?
            .set_position(LogicalPosition::new(placed_pet.x, placed_pet.y))
            .map_err(|e| e.to_string())?;
    }
    if let Some(w) = app.get_webview_window("panel") {
        w.set_size(LogicalSize::new(r.w, r.h))
            .map_err(|e| e.to_string())?;
        w.set_position(LogicalPosition::new(r.x, r.y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn show_panel(app: &tauri::AppHandle) -> Result<()> {
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
    #[cfg(target_os = "macos")]
    let r = {
        use objc2::MainThreadMarker;
        use objc2_app_kit::{NSEvent, NSScreen};
        let mtm = MainThreadMarker::new().ok_or("窗口操作需在主线程执行")?;
        let screens = NSScreen::screens(mtm);
        let primary = screens.firstObject().ok_or("无法获取主屏幕")?;
        let point = NSEvent::mouseLocation();
        let screen = screens
            .iter()
            .find(|screen| {
                let f = screen.frame();
                point.x >= f.origin.x
                    && point.x < f.origin.x + f.size.width
                    && point.y >= f.origin.y
                    && point.y < f.origin.y + f.size.height
            })
            .ok_or("无法获取菜单栏所在屏幕")?;
        let f = screen.visibleFrame();
        windows::cocoa_menu_position(
            primary.frame().size.height,
            point.x,
            windows::Rect {
                x: f.origin.x,
                y: f.origin.y,
                w: f.size.width,
                h: f.size.height,
            },
        )
    };
    #[cfg(not(target_os = "macos"))]
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
                h: 620.,
            },
            windows::right_inset(windows::Rect {
                x: area.position.x as f64 / scale,
                y: area.position.y as f64 / scale,
                w: area.size.width as f64 / scale,
                h: area.size.height as f64 / scale,
            }),
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
fn move_pet(app: tauri::AppHandle, x: f64, y: f64) -> Result<()> {
    if !x.is_finite() || !y.is_finite() {
        return Err("窗口位置无效".into());
    }
    let p = windows::Rect {
        x,
        y,
        w: 300.,
        h: 230.,
    };
    let a = monitor_rect(&app, p)?;
    let r = windows::clamp(p, a);
    app.get_webview_window("pet")
        .ok_or("窗口不存在")?
        .set_position(LogicalPosition::new(r.x, r.y))
        .map_err(|e| e.to_string())
}
fn hide_task_panel(app: &tauri::AppHandle) -> Result<()> {
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
fn tick(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let Ok(mut s) = state.0.lock() else { return };
    match reminders::deliver(&mut s, Local::now().fixed_offset(), |n| {
        let _ = app.emit("reminder-tasks", &n.task_ids);
        notifications::send(app, &n.body)
    }) {
        Ok(true) => {
            let _ = app.emit("reminder", ());
        }
        Err(e) => {
            let _ = app.emit("notification-warning", e);
        }
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
    let default = windows::Rect {
        x: st.pet_x.unwrap_or(99999.),
        y: st.pet_y.unwrap_or(99999.),
        w: 300.,
        h: 230.,
    };
    let a = monitor_rect(app, default)?;
    let p = if st.pet_x.is_none() {
        windows::Rect {
            x: a.x + a.w - 320.,
            y: a.y + a.h - 250.,
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
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_local_identity,
            save_task,
            delete_task,
            export_tasks,
            update_preferences,
            set_focus,
            snooze,
            toggle_panel,
            hide_panel,
            is_panel_visible,
            get_pet_position,
            move_pet,
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
            let store = Store::open(&dir.join("tasks.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(AppState(Mutex::new(store)));
            let show = MenuItem::with_id(app, "show", "打开任务面板", true, None::<&str>)?;
            let pet = MenuItem::with_id(app, "pet", "显示 / 隐藏精灵", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Task Sprite", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &pet, &quit])?;
            TrayIconBuilder::new()
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
            if let Some(w) = app.get_webview_window("pet") {
                w.set_focusable(false)?;
                w.set_visible_on_all_workspaces(true)?;
            }
            if let Some(w) = app.get_webview_window("panel") {
                w.set_visible_on_all_workspaces(true)?;
            }
            notifications::initialize(app.handle());
            restore_pet(app.handle()).map_err(std::io::Error::other)?;
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
                            st.pet_y = Some(*y as f64 / scale);
                            let _ = s.set_settings(st);
                        }
                    };
                }
                if let Some(panel) = w.app_handle().get_webview_window("panel") {
                    if panel.is_visible().unwrap_or(false) {
                        let _ = place_panel(w.app_handle());
                    }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Task Sprite 无法启动，请检查本地数据目录与系统权限");
}
