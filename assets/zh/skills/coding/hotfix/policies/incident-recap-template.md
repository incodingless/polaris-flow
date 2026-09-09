# 事故复盘模板（hotfix 配套）

> **使用范围**：仅 `polaris{{SKN_SPR}}coding{{SKN_SPR}}hotfix` 技能的任务产物——「incident 复盘」任务用本模板产出 `docs/incidents/<change_id>.md`。
> **不**被其他技能（如 normal / tweak）使用；其他场景的复盘走 retro 阶段产物。

## 写盘路径

- 模板：`assets/zh/skills/coding/hotfix/policies/incident-recap-template.md`（本文件）
- 落盘：`docs/incidents/<change_id>.md`（按 `<change_id>` kebab-case）

## 模板骨架

```markdown
# Incident Recap — <change_id>

- **发生时间**：<YYYY-MM-DD HH:MM TZ>
- **发现时间**：<YYYY-MM-DD HH:MM TZ>
- **修复时间**：<YYYY-MM-DD HH:MM TZ>
- **持续时长**：<minutes>
- **严重程度**：<P0 / P1 / P2>
- **Owner**：<name>

## 影响

- 影响用户数：<N or range>
- 影响数据：<yes/no, scope>
- 业务损失：<revenue / SLA / brand>
- 是否触发告警：<yes/no>

## 时间线

- HH:MM — 事件发生（自动 / 客服 / 监控）
- HH:MM — 收到告警 / 用户反馈
- HH:MM — 定位根因
- HH:MM — 开始修复
- HH:MM — 上线 / 缓解
- HH:MM — 确认恢复

## 根因

- 一句话：<what broke>
- 详细：<file/func/line + 触发条件>

## 修复

- 改：<commit / PR 链接>
- 回归测试：<test name / file>

## 为什么没拦住（5 Whys）

1. Why 1：<>
2. Why 2：<>
3. Why 3：<>
4. Why 4：<>
5. Why 5：<>

## 后续行动

| ID | 行动 | Owner | 截止 | 状态 |
|----|------|-------|------|------|
| A1 | 补充 XX 监控 | <name> | <date> | open |
| A2 | 补 XX 单元测试 | <name> | <date> | open |
| A3 | 更新 runbook | <name> | <date> | open |

## 教训

- 技术：<>
- 流程：<>
- 沟通：<>
```

## 写作约束

- **必填**：「时间线 / 根因 / 为什么没拦住 / 后续行动」四项，缺一即 reject
- **5 Whys** 必填且 ≥3 层（少于 3 层视为深度不够）
- **后续行动** 至少 1 条，且必须含 owner + 截止日期
- 不超过 14 天内回写完成（与 ship 的归档守门联动）
