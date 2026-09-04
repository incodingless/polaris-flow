# Constitution Amend — 宪法修正流程

## 触发条件

- `openspec/memory/constitution.md` 存在且无占位符
- 用户请求修改宪法

## 版本号决策

| 修改类型 | 版本号变更 |
|---------|-----------|
| 新增 Principle | MINOR +1 |
| 修改 Principle 措辞（语义不变） | PATCH +1 |
| 修改 Principle 语义 | MAJOR +1 |
| 删除 Principle | MAJOR +1 |
| 变更 NON-NEGOTIABLE 标记 | MAJOR +1 |

## 流程

### 1. 显示当前宪法

完整输出当前版本。

### 2. 确认修改意图

- "你想修改哪条 Principle？"
- "是修改措辞、语义、还是增删？"

### 3. 生成 Sync Impact Report

```markdown
## Sync Impact Report

**修改摘要**：{{SUMMARY}}
**版本号变更**：{{OLD}} → {{NEW}}
**影响范围**：
- [ ] design.md 中的 Constitution Alignment 节需更新
- [ ] 已通过审计的变更是否需要重新审计
- [ ] 其他受影响文档
```

### 4. 用户确认后执行

- 更新 constitution.md
- 更新版本号和 Last Amended 日期
- Commit

### 5. 验证有效性

执行 `constitution-validity.sh` 确认 exit 0。
