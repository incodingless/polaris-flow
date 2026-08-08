# Phase 6 — 产出 artifact

将管道各节组装为 `openspec/changes/<change-name>/intent.md`。

## 模板

见 `intent-output-template.md`：

- **standard / complex** — 完整节
- **simple** — 短模板变体（可省略空的 expand-log / grill-log）

## 路径

- **不要**写入 `docs/superpowers/specs/`（polaris 工作流重定向到 change 目录）
- 用户对路径的偏好优先于默认

## 规格自检（内联，写完后立即）

1. 占位符扫描 — 无 TODO/TBD/待定
2. 内部一致性 — 章节无矛盾
3. 范围检查 — 单 change 可覆盖
4. 模糊性检查 — 需求不可双解

发现问题直接内联修复。

## 不要

- 预填 `design.md` 或其他 design-* 工件
- 复制 proposal 正文
