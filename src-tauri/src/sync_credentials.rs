use crate::store::Result;
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Credential {
    pub account: String,
    pub token: String,
    #[serde(default)]
    pub license: Option<crate::sync_store::LicenseStatus>,
}
fn decode(bytes: &[u8]) -> Result<Option<Credential>> {
    if bytes.is_empty() { return Ok(None); }
    if bytes.len() > 16384 { return Err("同步凭据异常，请重新验证原授权码；任务仍保留".into()); }
    serde_json::from_slice(bytes).map(Some).map_err(|_| "同步凭据异常，请重新验证原授权码；任务仍保留".into())
}
pub(crate) fn restore_summary(store: &crate::store::Store, credential: Result<Option<Credential>>) -> Result<()> {
    let status = store.sync_status()?;
    if status.bound { return Ok(()); }
    match credential {
        Ok(Some(Credential { license: Some(license), .. })) => store.sync_cache_license(Some(&license)),
        _ if status.enabled => match status.account_id { Some(account) => store.sync_cache_activation(&account), None => Ok(()) },
        _ => Ok(()),
    }
}
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use std::{io::Write, path::PathBuf, process::{Command, Stdio}, sync::OnceLock};
    static AGENT: OnceLock<PathBuf> = OnceLock::new();
    pub fn initialize(path: PathBuf) { let _ = AGENT.set(path); }
    fn verify_agent(path: &std::path::Path, hash: &str) -> Result<()> {
        let verified = Command::new("/usr/bin/codesign").args(["--verify", "--strict", "-R", &format!("=cdhash H\"{hash}\"")]).arg(path).output().map_err(|_| "同步凭据组件校验失败")?;
        if !verified.status.success() { return Err("同步凭据组件校验失败，请重新安装此版本；任务仍保留".into()); }
        Ok(())
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn pinned_agent_check_accepts_the_real_code_hash_and_rejects_a_replacement() {
            let path=std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/bin/task-sprite-credential-agent"));
            let info=Command::new("/usr/bin/codesign").args(["-dvvv"]).arg(path).output().unwrap();
            let text=String::from_utf8_lossy(&info.stderr);
            let hash=text.lines().find_map(|line|line.strip_prefix("CDHash=")).unwrap();
            assert!(verify_agent(path,hash).is_ok());
            assert!(verify_agent(path,"0000000000000000000000000000000000000000").is_err());
        }
    }
    fn invoke(operation: &str, input: Option<&[u8]>) -> Result<Vec<u8>> {
        let path = AGENT.get().ok_or("同步凭据组件尚未准备好")?;
        let hash = option_env!("TASK_SPRITE_AGENT_CDHASH").ok_or("当前构建缺少凭据组件校验信息，请使用项目打包脚本")?;
        verify_agent(path, hash)?;
        let mut child = Command::new(path).arg(operation).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|_| "无法启动同步凭据组件")?;
        let written = if let Some(input) = input { child.stdin.take().ok_or("凭据传输未就绪")?.write_all(input).map_err(|_| "凭据传输未完成") } else { drop(child.stdin.take()); Ok(()) };
        let output = child.wait_with_output().map_err(|_| "同步凭据组件未完成")?;
        written?;
        if !output.status.success() {
            // Only internal status information is logged, never credential bytes.
            eprintln!("credential agent failed: {}", String::from_utf8_lossy(&output.stderr).trim());
            return Err("同步凭据暂不可用，请验证原授权码以恢复同步；本机任务与设备名额保留".into());
        }
        Ok(output.stdout)
    }
    pub fn read() -> Result<Option<Credential>> { decode(&invoke("read", None)?) }
    pub fn write(value: &Credential) -> Result<()> {
        let bytes = serde_json::to_vec(value).map_err(|_| "同步凭据无法编码")?;
        if bytes.len() > 16384 { return Err("同步凭据异常".into()); }
        invoke("write", Some(&bytes)).map(|_| ())
    }
    pub fn clear() -> Result<()> { invoke("clear", None).map(|_| ()) }
}
#[cfg(target_os = "windows")]
#[path = "windows_credentials.rs"]
mod platform;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::*;
    pub fn initialize(_: std::path::PathBuf) {}
    pub fn read() -> Result<Option<Credential>> { Ok(None) }
    pub fn write(_: &Credential) -> Result<()> { Err("当前系统的安全凭据存储尚未接入，请先使用本地版".into()) }
    pub fn clear() -> Result<()> { Ok(()) }
}
pub use platform::{clear, initialize, read, write};
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn absent_secret_is_not_a_fake_activation() { assert!(decode(b"").unwrap().is_none()); }
    #[test] fn corrupt_secret_is_recoverable_without_exposing_its_contents() {
        let error=decode(b"private-corrupt-credential").err().unwrap();
        assert!(!error.contains("private-corrupt-credential"));
        assert!(decode(&vec![b'x';16385]).is_err());
    }
    #[test] fn protected_credential_round_trips_without_changing_workspace() {
        let value=Credential{account:"same-workspace".into(),token:"test-device-token".into(),license:None};
        let restored=decode(&serde_json::to_vec(&value).unwrap()).unwrap().unwrap();
        assert_eq!(restored.account,value.account);assert_eq!(restored.token,value.token);
    }
}
