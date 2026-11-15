use super::{decode, Credential, Result};
use windows_sys::Win32::{Foundation::{GetLastError, ERROR_NOT_FOUND}, Security::Credentials::*};

const TARGET: &str = "io.jojoshine.tasksprite.sync.v2";
const STORAGE_ERROR: &str = "系统安全凭据暂不可用，请重新验证原授权码；本机任务仍保留";
pub fn initialize(_: std::path::PathBuf) {}
fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(Some(0)).collect() }
fn read_target(target: &str) -> Result<Option<Credential>> {
    let target = wide(target);
    let mut credential = std::ptr::null_mut();
    // Windows owns this allocation; release it even when decoding fails.
    unsafe {
        if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
            return if GetLastError() == ERROR_NOT_FOUND { Ok(None) } else { Err(STORAGE_ERROR.into()) };
        }
        let value = &*credential;
        let result = if value.CredentialBlobSize > CRED_MAX_CREDENTIAL_BLOB_SIZE {
            Err(STORAGE_ERROR.into())
        } else if value.CredentialBlobSize == 0 {
            decode(&[])
        } else if value.CredentialBlob.is_null() {
            Err(STORAGE_ERROR.into())
        } else {
            decode(std::slice::from_raw_parts(value.CredentialBlob, value.CredentialBlobSize as usize))
        };
        CredFree(credential.cast());
        result
    }
}
fn write_blob(target: &str, mut bytes: Vec<u8>) -> Result<()> {
    if bytes.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize { return Err("同步凭据过长，请重新验证原授权码；本机任务仍保留".into()); }
    let mut target = wide(target);
    let mut username = wide("device");
    let value = CREDENTIALW {
        Type: CRED_TYPE_GENERIC, TargetName: target.as_mut_ptr(),
        CredentialBlobSize: bytes.len() as u32, CredentialBlob: bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE, UserName: username.as_mut_ptr(),
        ..Default::default()
    };
    if unsafe { CredWriteW(&value, 0) } == 0 { return Err(STORAGE_ERROR.into()); }
    Ok(())
}
fn write_target(target: &str, value: &Credential) -> Result<()> {
    write_blob(target, serde_json::to_vec(value).map_err(|_| "同步凭据无法编码")?)
}
fn clear_target(target: &str) -> Result<()> {
    let target = wide(target);
    if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0
        && unsafe { GetLastError() } != ERROR_NOT_FOUND { return Err(STORAGE_ERROR.into()); }
    Ok(())
}
pub fn read() -> Result<Option<Credential>> { read_target(TARGET) }
pub fn write(value: &Credential) -> Result<()> { write_target(TARGET, value) }
pub fn clear() -> Result<()> { clear_target(TARGET) }

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    fn isolated_target() -> String { format!("io.jojoshine.tasksprite.test.{}", uuid::Uuid::new_v4()) }
    struct Cleanup(String);
    impl Drop for Cleanup { fn drop(&mut self) { let _ = clear_target(&self.0); } }
    #[test]
    fn windows_system_credentials_roundtrip_update_and_delete() {
        let target = isolated_target(); let _cleanup = Cleanup(target.clone());
        assert!(read_target(&target).unwrap().is_none());
        let value = Credential { account: "isolated-workspace".into(), token: "isolated-test-token".into(), license: None };
        write_target(&target, &value).unwrap();
        let restored = read_target(&target).unwrap().unwrap();
        assert_eq!(restored.account, value.account); assert_eq!(restored.token, value.token);
        let updated = Credential { token: "updated-test-token".into(), ..value };
        write_target(&target, &updated).unwrap();
        assert_eq!(read_target(&target).unwrap().unwrap().token, updated.token);
        // A new process must read persisted credentials, independent of in-memory state.
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["windows_credential_child_read", "--ignored", "--nocapture"])
            .env("TASK_SPRITE_TEST_CREDENTIAL_TARGET", &target).output().unwrap();
        assert!(output.status.success(), "child credential read failed: {}", String::from_utf8_lossy(&output.stderr));
        assert!(String::from_utf8_lossy(&output.stdout).contains("persisted credential verified"));
        clear_target(&target).unwrap(); assert!(read_target(&target).unwrap().is_none());
        clear_target(&target).unwrap();
    }
    #[test]
    #[ignore = "invoked only by the roundtrip parent with an isolated target"]
    fn windows_credential_child_read() {
        let Ok(target) = std::env::var("TASK_SPRITE_TEST_CREDENTIAL_TARGET") else { panic!("isolated target missing") };
        assert!(target.starts_with("io.jojoshine.tasksprite.test."));
        assert_eq!(read_target(&target).unwrap().unwrap().token, "updated-test-token");
        println!("persisted credential verified");
    }
    #[test]
    fn windows_corrupt_credential_fails_without_echoing_secret() {
        let target = isolated_target(); let _cleanup = Cleanup(target.clone());
        write_blob(&target, b"private-corrupt-credential".to_vec()).unwrap();
        let error = read_target(&target).err().unwrap();
        assert!(!error.contains("private-corrupt-credential"));
    }
    #[test]
    fn windows_oversized_credential_does_not_replace_previous_secret() {
        let target = isolated_target(); let _cleanup = Cleanup(target.clone());
        let value = Credential { account: "test".into(), token: "retained".into(), license: None };
        write_target(&target, &value).unwrap();
        let large = Credential { token: "x".repeat(CRED_MAX_CREDENTIAL_BLOB_SIZE as usize), ..value };
        assert!(write_target(&target, &large).is_err());
        assert_eq!(read_target(&target).unwrap().unwrap().token, "retained");
    }
}
