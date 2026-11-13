use crate::store::Result;
#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use block2::{DynBlock, RcBlock};
    use objc2::{
        define_class, msg_send,
        rc::Retained,
        runtime::{Bool, ProtocolObject},
        AnyThread, DefinedClass,
    };
    use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSString};
    use objc2_user_notifications::*;
    use std::{ptr::NonNull, sync::mpsc, time::Duration};
    pub struct Ivars {
        app: tauri::AppHandle,
    }
    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "TaskSpriteNotificationDelegate"]
        #[ivars=Ivars]
        pub struct Delegate;
        unsafe impl NSObjectProtocol for Delegate {}
        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List
                    | UNNotificationPresentationOptions::Sound,));
            }
            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn respond(
                &self,
                _center: &UNUserNotificationCenter,
                _response: &UNNotificationResponse,
                completion: &DynBlock<dyn Fn()>,
            ) {
                let app = self.ivars().app.clone();
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let _ = crate::show_panel(&h);
                });
                completion.call(());
            }
        }
    );
    pub fn initialize(app: &tauri::AppHandle) {
        let this = Delegate::alloc().set_ivars(Ivars { app: app.clone() });
        let delegate: Retained<Delegate> = unsafe { msg_send![super(this), init] };
        UNUserNotificationCenter::currentNotificationCenter()
            .setDelegate(Some(ProtocolObject::from_ref(&*delegate))); // The center keeps a weak reference; retain once for the process lifetime.
        let _ = Retained::into_raw(delegate);
    }
    pub fn status() -> Result<String> {
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            let status = unsafe { settings.as_ref() }.authorizationStatus();
            let s = if status == UNAuthorizationStatus::Authorized
                || status == UNAuthorizationStatus::Provisional
            {
                "granted"
            } else if status == UNAuthorizationStatus::NotDetermined {
                "not-determined"
            } else {
                "denied"
            };
            let _ = tx.send(s.to_string());
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .getNotificationSettingsWithCompletionHandler(&block);
        rx.recv_timeout(Duration::from_secs(5))
            .map_err(|_| "无法读取系统通知状态".into())
    }
    pub fn request() -> Result<String> {
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
            let result = if !error.is_null() {
                Err(format!(
                    "系统通知授权失败：{}",
                    unsafe { &*error }.localizedDescription()
                ))
            } else {
                Ok(if granted.as_bool() {
                    "granted".to_string()
                } else {
                    "denied".to_string()
                })
            };
            let _ = tx.send(result);
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
                &block,
            );
        rx.recv_timeout(Duration::from_secs(60))
            .map_err(|_| "请在系统设置中确认 Task Sprite 的通知权限".to_string())?
    }
    pub fn send(body: &str) -> Result<()> {
        if status()? != "granted" {
            return Err("系统通知尚未开启，任务提示仍会保留。请在提醒设置中开启通知。".into());
        }
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str("Task Sprite · 任务提醒"));
        content.setBody(&NSString::from_str(body));
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&uuid::Uuid::new_v4().to_string()),
            &content,
            None,
        );
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |error: *mut NSError| {
            let result = if error.is_null() {
                Ok(())
            } else {
                Err(unsafe { &*error }.localizedDescription().to_string())
            };
            let _ = tx.send(result);
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .addNotificationRequest_withCompletionHandler(&request, Some(&block));
        rx.recv_timeout(Duration::from_secs(5))
            .map_err(|_| "系统通知提交超时，将保留提醒并稍后重试".to_string())?
    }
}
#[cfg(target_os = "macos")]
pub fn initialize(app: &tauri::AppHandle) {
    mac::initialize(app)
}
#[cfg(not(target_os = "macos"))]
pub fn initialize(_app: &tauri::AppHandle) {}
#[cfg(target_os = "macos")]
pub fn status(_app: &tauri::AppHandle) -> Result<String> {
    mac::status()
}
#[cfg(target_os = "macos")]
pub fn request(_app: &tauri::AppHandle) -> Result<String> {
    mac::request()
}
#[cfg(target_os = "macos")]
pub fn send(_app: &tauri::AppHandle, body: &str) -> Result<()> {
    mac::send(body)
}
#[cfg(not(target_os = "macos"))]
pub fn status(app: &tauri::AppHandle) -> Result<String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .permission_state()
        .map(|s| format!("{s:?}").to_lowercase())
        .map_err(|e| e.to_string())
}
#[cfg(not(target_os = "macos"))]
pub fn request(app: &tauri::AppHandle) -> Result<String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .request_permission()
        .map(|s| format!("{s:?}").to_lowercase())
        .map_err(|e| e.to_string())
}
#[cfg(not(target_os = "macos"))]
pub fn send(app: &tauri::AppHandle, body: &str) -> Result<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title("Task Sprite · 任务提醒")
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}
