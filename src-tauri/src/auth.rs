// 凭据管理：按仓库 realm（域名+端口）存取 macOS 钥匙串。
// 密码只经内存与 stdin 传给 svn，绝不落盘、不进进程参数。

use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::svn::SvnError;

/// 钥匙串服务名前缀；账户名用 realm 区分不同仓库。
const SERVICE: &str = "SunnySVN";

/// 一份仓库凭据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub username: String,
    pub password: String,
}

/// 从 URL 提取 realm：scheme://host:port（svn 认证按服务器域而非完整路径）。
pub fn realm_of(url: &str) -> Result<String, SvnError> {
    let rest = url
        .split_once("://")
        .ok_or_else(|| SvnError::new("BAD_URL", format!("无法解析 URL: {url}")))?;
    let (scheme, tail) = rest;
    let host = tail.split('/').next().unwrap_or_default();
    if host.is_empty() {
        return Err(SvnError::new("BAD_URL", format!("URL 缺少主机名: {url}")));
    }
    Ok(format!("{scheme}://{host}"))
}

fn entry_for(realm: &str) -> Result<Entry, SvnError> {
    Entry::new(SERVICE, realm).map_err(|e| SvnError::internal(format!("访问钥匙串失败: {e}")))
}

/// 保存凭据（username\n 前缀 + 密码合并存储，钥匙串一条搞定）。
pub fn save(realm: &str, cred: &Credential) -> Result<(), SvnError> {
    let blob = format!("{}\n{}", cred.username, cred.password);
    entry_for(realm)?
        .set_password(&blob)
        .map_err(|e| SvnError::internal(format!("写入钥匙串失败: {e}")))
}

/// 读取凭据；未保存过返回 None。
pub fn load(realm: &str) -> Result<Option<Credential>, SvnError> {
    match entry_for(realm)?.get_password() {
        Ok(blob) => {
            let (user, pass) = blob.split_once('\n').unwrap_or((blob.as_str(), ""));
            Ok(Some(Credential {
                username: user.to_string(),
                password: pass.to_string(),
            }))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SvnError::internal(format!("读取钥匙串失败: {e}"))),
    }
}

/// 删除凭据（登出 / 换账号）。不存在也算成功。
pub fn delete(realm: &str) -> Result<(), SvnError> {
    match entry_for(realm)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(SvnError::internal(format!("删除钥匙串条目失败: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn realm_extraction() {
        assert_eq!(
            realm_of("https://svn.example.com/repo/trunk").unwrap(),
            "https://svn.example.com"
        );
        assert_eq!(
            realm_of("svn://host:3690/path").unwrap(),
            "svn://host:3690"
        );
        assert!(realm_of("not-a-url").is_err());
        assert!(realm_of("https:///path").is_err());
    }
}
