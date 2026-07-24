// 解析 svn --xml 输出。M0 覆盖 status 与 info；其余命令后续里程碑扩展。
// 用 quick-xml 的事件流解析，避免为每种输出定义完整 serde 结构。

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;

use super::errors::SvnError;

/// 单个文件的状态，字段与前端 types.ts 的 StatusEntry 对齐（camelCase）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub path: String,
    pub item_status: String,
    pub prop_status: String,
    pub versioned: bool,
    pub remote_changed: bool,
    pub copied: bool,
    pub revision: Option<i64>,
}

/// 工作副本信息，对齐前端 WorkingCopyInfo。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingCopyInfo {
    pub url: String,
    pub repository_root: String,
    pub revision: i64,
    pub relative_url: String,
}

/// svn 的单字符 item 状态映射为前端约定的字符串枚举。
fn map_item_status(s: &str) -> String {
    match s {
        "normal" => "normal",
        "modified" => "modified",
        "added" => "added",
        "deleted" => "deleted",
        "unversioned" => "unversioned",
        "missing" => "missing",
        "conflicted" => "conflicted",
        "ignored" => "ignored",
        "replaced" => "replaced",
        "external" => "external",
        "incomplete" => "incomplete",
        "none" => "none",
        _ => "none",
    }
    .to_string()
}

/// 解析 `svn status --xml` 的输出。
///
/// 结构大致为：
/// ```xml
/// <status>
///   <target path=".">
///     <entry path="src/main.rs">
///       <wc-status item="modified" props="none" revision="12" .../>
///       <repos-status item="modified" .../>   <!-- 仅 status -u 时 -->
///     </entry>
///   </target>
/// </status>
/// ```
pub fn parse_status(xml: &str) -> Result<Vec<StatusEntry>, SvnError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut entries: Vec<StatusEntry> = Vec::new();
    // 当前正在构建的 entry
    let mut cur_path: Option<String> = None;
    let mut cur_item = String::from("none");
    let mut cur_prop = String::from("none");
    let mut cur_versioned = true;
    let mut cur_remote = false;
    let mut cur_copied = false;
    let mut cur_rev: Option<i64> = None;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                match name.as_ref() {
                    b"entry" => {
                        // 新 entry 开始，重置累加器
                        cur_path = attr(&e, b"path");
                        cur_item = String::from("none");
                        cur_prop = String::from("none");
                        cur_versioned = true;
                        cur_remote = false;
                        cur_copied = false;
                        cur_rev = None;
                    }
                    b"wc-status" => {
                        if let Some(item) = attr(&e, b"item") {
                            cur_versioned = item != "unversioned" && item != "ignored";
                            cur_item = map_item_status(&item);
                        }
                        if let Some(props) = attr(&e, b"props") {
                            cur_prop = map_item_status(&props);
                        }
                        if let Some(c) = attr(&e, b"copied") {
                            cur_copied = c == "true";
                        }
                        cur_rev = attr(&e, b"revision").and_then(|r| r.parse().ok());
                    }
                    b"repos-status" => {
                        // status -u 时出现，表示远端有变更
                        if let Some(item) = attr(&e, b"item") {
                            cur_remote = item != "none";
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"entry" {
                    if let Some(path) = cur_path.take() {
                        entries.push(StatusEntry {
                            path,
                            item_status: cur_item.clone(),
                            prop_status: cur_prop.clone(),
                            versioned: cur_versioned,
                            remote_changed: cur_remote,
                            copied: cur_copied,
                            revision: cur_rev,
                        });
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(SvnError::internal(format!("解析 status XML 失败: {e}")))
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(entries)
}

/// 解析 `svn info --xml` 的输出（取第一个 entry）。
pub fn parse_info(xml: &str) -> Result<WorkingCopyInfo, SvnError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut revision: i64 = 0;
    let mut url = String::new();
    let mut repo_root = String::new();
    let mut relative_url = String::new();

    // 记录当前所在的元素，以便把 text 归属到正确字段。
    // 只有 Start 入栈（有对应 End）；Empty 元素无子节点，不入栈。
    let mut stack: Vec<Vec<u8>> = Vec::new();
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name().as_ref().to_vec();
                if name == b"entry" {
                    if let Some(r) = attr(&e, b"revision").and_then(|r| r.parse().ok()) {
                        revision = r;
                    }
                }
                stack.push(name);
            }
            Ok(Event::Empty(e)) => {
                // 自闭合元素（如 <entry .../> 极少见于 info，但稳妥处理 revision）
                if e.name().as_ref() == b"entry" {
                    if let Some(r) = attr(&e, b"revision").and_then(|r| r.parse().ok()) {
                        revision = r;
                    }
                }
            }
            Ok(Event::Text(t)) => {
                let text = t.unescape().unwrap_or_default().to_string();
                match stack.last().map(|v| v.as_slice()) {
                    Some(b"url") => url = text,
                    Some(b"root") => repo_root = text,
                    Some(b"relative-url") => relative_url = text,
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                stack.pop();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(SvnError::internal(format!("解析 info XML 失败: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    if url.is_empty() {
        return Err(SvnError::internal("info 输出缺少 url，可能不是有效工作副本"));
    }

    Ok(WorkingCopyInfo {
        url,
        repository_root: repo_root,
        revision,
        relative_url,
    })
}

/// 从事件里读取指定属性值，找不到返回 None。
fn attr(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if a.key.as_ref() == key {
            Some(String::from_utf8_lossy(&a.value).into_owned())
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_entries() {
        let xml = r#"<?xml version="1.0"?>
<status>
  <target path=".">
    <entry path="src/main.rs">
      <wc-status item="modified" props="none" revision="12"/>
    </entry>
    <entry path="new.txt">
      <wc-status item="unversioned" props="none"/>
    </entry>
  </target>
</status>"#;
        let entries = parse_status(xml).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "src/main.rs");
        assert_eq!(entries[0].item_status, "modified");
        assert!(entries[0].versioned);
        assert_eq!(entries[0].revision, Some(12));
        assert_eq!(entries[1].item_status, "unversioned");
        assert!(!entries[1].versioned);
    }

    #[test]
    fn parses_info() {
        let xml = r#"<?xml version="1.0"?>
<info>
  <entry kind="dir" path="." revision="42">
    <url>https://svn.example.com/repo/trunk</url>
    <relative-url>^/trunk</relative-url>
    <repository>
      <root>https://svn.example.com/repo</root>
    </repository>
  </entry>
</info>"#;
        let info = parse_info(xml).unwrap();
        assert_eq!(info.revision, 42);
        assert_eq!(info.url, "https://svn.example.com/repo/trunk");
        assert_eq!(info.repository_root, "https://svn.example.com/repo");
        assert_eq!(info.relative_url, "^/trunk");
    }
}
