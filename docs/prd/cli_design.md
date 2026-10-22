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


### 更新程序、资产与依赖（范围可选）
```
polaris update [path]
```

三层更新，缺省全量：

| 层 | 成员 | 说明 |
|---|---|---|
| `program` | — | CLI 程序本体（npm 包）。探测实际使用的包管理器后全局安装 `@latest`；`npx` 临时执行时只提示 |
| `assets` | `skills` `commands` `agents` `rules` `hooks` | 按资产源指纹（`.polaris/skills-lock.json` 的 `assets`）判断是否需要重写 |
| `deps` | `openspec` `superpowers` `codegraph` | 复用 init 侧的安装器 |

| 选项 | 描述 |
|------|------|
| `--only <items>` | 只更新列出的项（组名 `program` / `assets` / `deps` / `all`，或成员名）；与 `--skip` 互斥 |
| `--skip <items>` | 跳过列出的项，其余按全量 |
| `--force` | 忽略资产源指纹，强制重写所选类别 |
| `--prune` | 删除 Polaris 独占目录下已不在资产清单中的陈旧产物（当前覆盖 `skills` / `commands`） |
| `--lang <lang>` | 技能语言：`zh` 或 `en`；缺省读 `.polaris/config.yaml` |
| `--scope <scope>` | 安装范围：`project` 或 `global`；缺省读 `.polaris/config.yaml` |
| `--json` | 输出结构化 JSON |


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