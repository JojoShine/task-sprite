use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
}

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let update = app.updater().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())?;
    Ok(UpdateInfo {
        current_version: app.package_info().version.to_string(),
        version: update.as_ref().map(|v| v.version.clone()),
        notes: update.and_then(|v| v.body),
    })
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    let update = app.updater().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())?
        .ok_or("目前没有可安装的更新")?;
    if update.version != version {
        return Err("版本信息已变化，请重新检查更新".into());
    }
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}
