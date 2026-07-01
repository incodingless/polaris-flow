## CLI 命令

### 初始化工作流
```
 polaris init [path] 
```
为选定的 AI 编码平台安装 OpenSpec、Superpowers 和 polaris-flow 技能。

| 选项 | 描述 |
|------|------|
| `--yes` | 非交互模式，自动选择已检测平台 |
| `--scope <scope>` | 安装范围：`project` 或 `global` |
| `--overwrite` | 覆盖已安装的组件 |
| `--skip-existing` | 跳过已安装的组件 |
| `--lang <lang>` | 技能语言：`zh` 或 `en` |
| `--json` | 输出结构化 JSON |


### 更新技能到最新版本
```
polaris update [path]
```

检查各上游仓库的最新 tag，差量更新本地技能文件。

| 选项 | 描述 |
|------|------|
| `--force` | 强制重新拉取所有组件 |


### 诊断安装健康状态
```
polaris doctor [path]
```

检查 bash、git、node、openspec CLI、skills-lock.json 等依赖项。

| 选项 | 描述 |
|------|------|
| `--json` | 输出结构化诊断结果 |


### 显示活跃变更状态（多 worktree 感知）
```
polaris status [path]
```

从主仓 `.harness/workflow.yaml` 读取活跃变更列表，支持在任何 worktree 内执行。

| 选项 | 描述 |
|------|------|
| `--json` | 输出 JSON 格式 |

### 其他

| 命令 | 描述 |
|------|------|
| `easyflow --help` | 显示帮助 |
| `easyflow --version` | 显示版本 |