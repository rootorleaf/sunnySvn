// svn 错误码到结构化错误的映射。前端根据 code 决定弹哪种对话框。

use serde::Serialize;

/// 传给前端的结构化错误：code 用于分支处理，message 用于展示。
#[derive(Debug, Clone, Serialize)]
pub struct SvnError {
    pub code: String,
    pub message: String,
}

impl SvnError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    /// svn 未安装 / 无法定位
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new("SVN_NOT_FOUND", msg)
    }

    /// 内部错误（IO、解析等）
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new("INTERNAL", msg)
    }

    /// 从 svn 的 stderr 文本中提取已知错误码，映射为结构化错误。
    /// svn 的报错通常形如：`svn: E170001: Authorization failed`。
    pub fn from_stderr(stderr: &str) -> Self {
        let code = extract_code(stderr).unwrap_or_else(|| "SVN_ERROR".to_string());
        let message = clean_message(stderr);
        Self::new(code, message)
    }
}

/// 从 stderr 中抓第一个形如 E###### 的错误码
fn extract_code(stderr: &str) -> Option<String> {
    for token in stderr.split(|c: char| !c.is_ascii_alphanumeric()) {
        if token.len() >= 6
            && token.starts_with('E')
            && token[1..].chars().all(|c| c.is_ascii_digit())
        {
            return Some(token.to_string());
        }
    }
    None
}

/// 去掉多余的 `svn: ` 前缀和空行，保留可读信息
fn clean_message(stderr: &str) -> String {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return "svn 命令执行失败".to_string();
    }
    trimmed
        .lines()
        .map(|l| l.trim_start_matches("svn: ").trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

impl std::fmt::Display for SvnError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for SvnError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_known_code() {
        let e = SvnError::from_stderr("svn: E170001: Authorization failed");
        assert_eq!(e.code, "E170001");
        assert!(e.message.contains("Authorization failed"));
    }

    #[test]
    fn falls_back_when_no_code() {
        let e = SvnError::from_stderr("svn: some unexpected failure");
        assert_eq!(e.code, "SVN_ERROR");
    }

    #[test]
    fn handles_empty_stderr() {
        let e = SvnError::from_stderr("");
        assert_eq!(e.code, "SVN_ERROR");
        assert!(!e.message.is_empty());
    }
}
