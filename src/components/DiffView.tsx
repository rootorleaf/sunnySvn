// 双栏差异视图：BASE(左) vs 工作区(右)，CodeMirror MergeView 渲染。
// 跟随 appStore.selectedFile 变化自动加载。

import { useEffect, useRef, useState } from "react";
import { Alert, Empty, Spin } from "antd";
import { MergeView } from "@codemirror/merge";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { useAppStore } from "../stores/appStore";
import * as svnApi from "../api/svn";
import type { SvnError } from "../api/svn";
import type { FileDiff } from "../types";

/** 只读编辑器公共配置 */
function readonlyExtensions() {
  return [
    lineNumbers(),
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
  ];
}

export function DiffView() {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const selectedId = useAppStore((s) => s.selectedId);
  const workingCopies = useAppStore((s) => s.workingCopies);
  const wcPath = workingCopies.find((w) => w.id === selectedId)?.path ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mergeRef = useRef<MergeView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SvnError | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);

  // 加载差异内容；用 token 防止快速切换时的竞态
  useEffect(() => {
    setDiff(null);
    setError(null);
    if (!selectedFile || !wcPath) return;
    let stale = false;
    setLoading(true);
    svnApi
      .getFileDiff(wcPath, selectedFile.path)
      .then((d) => {
        if (!stale) setDiff(d);
      })
      .catch((e) => {
        if (!stale) setError(e as SvnError);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [selectedFile, wcPath]);

  // 渲染 / 销毁 MergeView
  useEffect(() => {
    if (!diff || !containerRef.current) return;
    const view = new MergeView({
      a: { doc: diff.oldText, extensions: readonlyExtensions() },
      b: { doc: diff.newText, extensions: readonlyExtensions() },
      parent: containerRef.current,
      collapseUnchanged: { margin: 3, minSize: 5 },
    });
    mergeRef.current = view;
    return () => {
      view.destroy();
      mergeRef.current = null;
    };
  }, [diff]);

  if (!selectedFile) {
    return (
      <div className="panel-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击上方文件查看差异" />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="panel-center">
        <Spin />
      </div>
    );
  }
  if (error) {
    const infoCodes: Record<string, string> = {
      BINARY_FILE: "二进制文件不支持文本对比",
      IS_DIRECTORY: "目录没有可对比的内容",
    };
    const infoTitle = infoCodes[error.code];
    return (
      <Alert
        type={infoTitle ? "info" : "error"}
        showIcon
        style={{ margin: 12 }}
        message={infoTitle ?? "读取差异失败"}
        description={error.message}
      />
    );
  }
  return (
    <div className="diff-wrap">
      <div className="diff-header">
        <span className="diff-side">BASE</span>
        <span className="diff-file">{selectedFile.path}</span>
        <span className="diff-side">工作区</span>
      </div>
      <div ref={containerRef} className="diff-container" />
    </div>
  );
}
