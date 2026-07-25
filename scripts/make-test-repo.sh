#!/bin/bash
# 重建 SunnySVN 本地测试仓库（file:// 协议），用于端到端验证。
# 产物：
#   $ROOT/repo  — svn 仓库（trunk/branches/tags 布局）
#   $ROOT/wc    — trunk 的工作副本，含中文路径样例与各类状态的文件
# 用法：scripts/make-test-repo.sh [根目录]   # 默认 /tmp/sunnysvn-test

set -euo pipefail

ROOT="${1:-/tmp/sunnysvn-test}"
REPO_URL="file://$ROOT/repo"

rm -rf "$ROOT"
mkdir -p "$ROOT/import/trunk/src" "$ROOT/import/trunk/文档" "$ROOT/import/branches" "$ROOT/import/tags"

# 初始内容：英文与中文路径混合
printf 'fn main() {\n    println!("hello");\n}\n' > "$ROOT/import/trunk/src/main.rs"
printf '# 测试项目\n中文内容第一行\n' > "$ROOT/import/trunk/文档/说明.md"
printf 'readme\n' > "$ROOT/import/trunk/README.txt"

svnadmin create "$ROOT/repo"
svn import -q "$ROOT/import" "$REPO_URL" -m "initial import" --non-interactive

svn checkout -q "$REPO_URL/trunk" "$ROOT/wc" --non-interactive

# 第二笔提交：制造历史（中文提交信息）
printf 'second line\n' >> "$ROOT/wc/README.txt"
svn commit -q "$ROOT/wc" -m "第二笔提交：追加 README" --non-interactive

# 工作区铺各类状态：M（修改）/ ?（未版本化）/ A（新增）/ D（删除）/ !（丢失）
printf 'modified\n' >> "$ROOT/wc/src/main.rs"
printf '中文改动\n' >> "$ROOT/wc/文档/说明.md"
printf 'unversioned\n' > "$ROOT/wc/新建未跟踪.txt"
printf 'added\n' > "$ROOT/wc/added.rs"
svn add -q "$ROOT/wc/added.rs" --non-interactive
svn delete -q "$ROOT/wc/README.txt" --non-interactive

echo "测试仓库已就绪："
echo "  仓库: $REPO_URL"
echo "  工作副本: $ROOT/wc"
