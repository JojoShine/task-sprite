use crate::store::{Result, Store};
use crate::sync_store::LicenseStatus;
use chrono::{DateTime, Utc};
use rusqlite::OptionalExtension;

pub const FREE: [&str; 4] = ["cat", "shiba", "robot", "ghost"];
pub const LICENSED: [&str; 6] = ["fox", "panda", "mint-ghost", "sunset-robot", "snow-shiba", "cream-cat"];
impl Store {
    // Cached activation is independent of whether task synchronization is enabled.
    pub fn looks_expires_at(&self) -> Result<Option<String>> {
        let initialized: bool = self.conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_license')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if !initialized { return Ok(None); }
        let cached: Option<(String,String)> = self.conn.query_row("SELECT l.payload,m.account FROM sync_license l JOIN sync_meta m ON m.id=l.id WHERE l.id=1", [], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        Ok(cached.and_then(|(raw,account)| {
            let license: LicenseStatus = serde_json::from_str(&raw).ok()?;
            let expiry = DateTime::parse_from_rfc3339(&license.expires_at).ok()?;
            (license.account_id == account && expiry > Utc::now()).then_some(license.expires_at)
        }))
    }
    pub fn reject_cached_looks(&self, account: &str) -> Result<()> {
        // A single write preserves a bound marker, so startup cannot resurrect
        // a rejected credential summary even if the process exits during this update.
        let payload = serde_json::json!({"accountId":account,"activationOnly":true}).to_string();
        self.conn.execute("UPDATE sync_license SET payload=?1 WHERE id=1 AND EXISTS(SELECT 1 FROM sync_meta WHERE id=1 AND account=?2)", rusqlite::params![payload,account]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn require_look(&self, pet: &str) -> Result<()> {
        if FREE.contains(&pet) { return Ok(()); }
        if !LICENSED.contains(&pet) { return Err("请选择内置伙伴或装扮".into()); }
        if self.looks_expires_at()?.is_none() { return Err("此装扮需要已激活且未到期的授权".into()); }
        Ok(())
    }
}

pub(crate) fn reject_looks_if_current(store: &Store, account: &str, request_generation: u64, current_generation: u64, error: &str) -> Result<bool> {
    if request_generation == current_generation && matches!(error,
        "此电脑的授权已失效或已停用，请重新激活授权" | "授权已到期或已停用，请检查授权；本机任务仍保留")
        && store.sync_status()?.account_id.as_deref() == Some(account) {
        store.reject_cached_looks(account)?;
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use crate::{store::Store, sync_store::LicenseStatus};
    fn licensed() -> Store {
        let store = Store::memory().unwrap();
        store.sync_link("looks-test").unwrap();
        store.sync_cache_license(Some(&LicenseStatus {account_id:"looks-test".into(),code_hint:"test".into(),expires_at:"2099-01-01T00:00:00Z".into(),device_limit:3,devices_used:1})).unwrap();
        store
    }
    #[test]
    fn offline_activation_allows_all_six_looks_and_roundtrips() {
        let mut store = licensed();
        for pet in ["fox","panda","mint-ghost","sunset-robot","snow-shiba","cream-cat"] {
            let mut settings = store.snapshot().unwrap().settings;
            settings.pet = pet.into();
            store.set_settings(settings).unwrap();
            assert_eq!(store.snapshot().unwrap().settings.pet,pet);
        }
    }
    #[test]
    fn deactivation_preserves_preference_and_free_choices() {
        let mut store = licensed();
        let mut settings = store.snapshot().unwrap().settings;
        settings.pet = "fox".into();
        store.set_settings(settings.clone()).unwrap();
        store.sync_cache_license(None).unwrap();
        // Unrelated settings and task operations remain usable after expiry.
        settings.show_hint = false;
        store.set_settings(settings).unwrap();
        let snapshot = store.snapshot().unwrap();
        assert_eq!(snapshot.settings.pet,"fox");
        assert!(serde_json::to_value(snapshot).unwrap()["looksExpiresAt"].is_null());
        let mut free = store.snapshot().unwrap().settings;
        free.pet = "cat".into();
        store.set_settings(free).unwrap();
        let mut denied = store.snapshot().unwrap().settings;
        denied.pet = "fox".into();
        assert!(store.set_settings(denied).is_err());
    }
    #[test]
    fn missing_and_expired_activation_deny_look_writes() {
        for expiry in [None,Some("2020-01-01T00:00:00Z"),Some("invalid")] {
            let mut store = licensed();
            match expiry {None=>store.sync_cache_license(None).unwrap(),Some(at)=>store.sync_cache_license(Some(&LicenseStatus {account_id:"looks-test".into(),code_hint:"test".into(),expires_at:at.into(),device_limit:3,devices_used:1})).unwrap()}
            let mut settings = store.snapshot().unwrap().settings;
            settings.pet = "panda".into();
            assert!(store.set_settings(settings).is_err());
        }
    }
    #[test]
    fn revoked_entitlement_cannot_be_restored_from_old_credential_summary() {
        let store = licensed();
        let credential = crate::sync_credentials::Credential {account:"looks-test".into(),token:"fixture-only".into(),license:store.sync_status().unwrap().license};
        assert!(store.looks_expires_at().unwrap().is_some());
        store.reject_cached_looks("looks-test").unwrap();
        crate::sync_credentials::restore_summary(&store,Ok(Some(credential))).unwrap();
        assert!(store.looks_expires_at().unwrap().is_none());
        assert!(store.require_look("fox").is_err());
        assert!(store.require_look("cat").is_ok());
    }
    #[test]
    fn another_workspace_rejection_cannot_clear_current_activation() {
        let store = licensed();
        store.reject_cached_looks("other-account").unwrap();
        assert!(store.looks_expires_at().unwrap().is_some());
    }
    #[test]
    fn selected_look_survives_database_reopen() {
        let path = std::env::temp_dir().join(format!("task-sprite-looks-{}.db",uuid::Uuid::new_v4()));
        {
            let mut store = Store::open(&path).unwrap();
            store.sync_link("looks-test").unwrap();
            store.sync_cache_license(licensed().sync_status().unwrap().license.as_ref()).unwrap();
            let mut settings = store.snapshot().unwrap().settings;
            settings.pet = "panda".into();
            store.set_settings(settings).unwrap();
        }
        let reopened = Store::open(&path).unwrap();
        assert_eq!(reopened.snapshot().unwrap().settings.pet,"panda");
        assert!(reopened.looks_expires_at().unwrap().is_some());
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn stale_auth_errors_and_offline_failures_preserve_new_activation() {
        for (request,current,error) in [(1,2,"此电脑的授权已失效或已停用，请重新激活授权"),(2,2,"同步服务暂时无法连接，任务已保存在本机；联网后会重试"),(2,2,"同步服务暂不可用（503），本地任务仍保留")] {
            let store=licensed();
            super::reject_looks_if_current(&store,"looks-test",request,current,error).unwrap();
            assert!(store.looks_expires_at().unwrap().is_some());
        }
        for error in ["此电脑的授权已失效或已停用，请重新激活授权","授权已到期或已停用，请检查授权；本机任务仍保留"] {
            let store=licensed();
            super::reject_looks_if_current(&store,"looks-test",2,2,error).unwrap();
            assert!(store.looks_expires_at().unwrap().is_none());
        }
    }

}
