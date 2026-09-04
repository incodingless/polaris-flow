# Constitution Injection — 四注入点逻辑

## 核心原则

宪法在工作流的 4 个关键点注入，确保全程合规。每个注入点的行为明确、不可跳过。

## 四注入点

### 注入点 A：design 入口

**位置**：`/ezfl:design` command 启动时
**行为**：
1. subagent 入口 read 宪法
2. 在设计探索过程中参考宪法原则
3. design.md 必须含 `## Constitution Alignment` 节

### 注入点 B：lock 完成后

**位置**：`/ezfl:lock` command，plan-review 完成后
**行为**：
1. lock subagent 追加 `## Constitution Compliance` 节到评审报告
2. 逐条评估计划是否可能违反宪法
3. STATUS 聚合规则：取 plan-review 与 Constitution Compliance 中更严者

### 注入点 C：build 入口

**位置**：`/ezfl:build` command，每个任务子步骤 1 前
**行为**：
1. build subagent 入口 read 宪法
2. 每个任务开始前输出：与本任务相关的宪法原则
3. 执行过程中参照原则

### 注入点 D：audit Step 1

**位置**：`/ezfl:audit` command 的 Constitution Compliance Audit 步骤
**行为**：
1. 详见 `constitution-audit.md`
2. 逐条核对，输出违规清单
3. 违规 → 停等用户三选项

## 有效性前置检查

每个注入点入口都先执行 `constitution-validity.sh`：
- exit 0 → 执行注入
- exit 1 → constitution_required=true 时阻断，=false 时警告后跳过
- exit 2 → 同 exit 1 逻辑
