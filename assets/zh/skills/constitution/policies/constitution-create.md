# Constitution Create — 宪法创建流程

## 触发条件

- `openspec/memory/constitution.md` 不存在
- 或文件存在但仍含 `[ALL_CAPS_PLACEHOLDER]`

## 流程

### 1. 介绍宪法概念

向用户解释：
- 宪法是项目的最高工程原则
- 凌驾于具体变更之上
- 在 design/lock/build/audit 4 个阶段注入检查

### 2. 引导用户定义 Core Principles

逐个询问：
- "这个项目最重要的工程原则是什么？"
- "哪些原则是 NON-NEGOTIABLE（绝对不可违反）？"
- "有哪些原则是推荐但可灵活处理的？"

建议 3-5 条原则（不要过多）。

### 3. 使用模板生成

**强制前置**：必须 `read_file templates/constitution-template.md`，并输出 `[easy-flow constitution] 已 read_file templates/constitution-template.md`。**禁止**未读模板就生成内容。

基于读取到的模板填充用户回答。

### 4. 确认并写入

- 展示完整宪法给用户确认
- 写入 `openspec/memory/constitution.md`
- 版本号设为 `1.0.0`
- Commit

### 5. 验证有效性

执行 `constitution-validity.sh` 确认 exit 0。
