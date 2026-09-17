## Purpose

定义 `polaris init` / install 安装 Superpowers 时的通道契约、skills CLI agent 标识、网络失败时的可见行为，以及摘要中组件级失败汇报规则。

## ADDED Requirements

### Requirement: Skills CLI agent 使用平台 id
系统在调用 `npx skills add` 时 MUST 使用 skills CLI 已注册的 agent id（与平台 `id` 对齐，例如 `trae-cn`、`trae`、`cursor`），MUST NOT 使用平台展示名（例如 `Trae-CN`、`Trae`）。

#### Scenario: Trae-CN 项目安装回退到 npx
- **WHEN** 用户为平台 `trae-cn` 安装 Superpowers 且进入 npx 回退通道
- **THEN** 命令行 MUST 包含 `--agent trae-cn`，且 MUST NOT 包含 `--agent Trae-CN`

#### Scenario: 未知平台 id
- **WHEN** 传入的平台 id 不在已注册平台列表中
- **THEN** 系统 MUST 在安装前失败并报告未知平台，不得静默调用 skills CLI

### Requirement: GitHub 优先与 npx 回退
系统 MUST 优先通过 GitHub shallow clone 安装 Superpowers；当 clone 失败时 MUST 回退到 `npx skills add obra/superpowers`。两条通道均失败时 MUST 将 Superpowers 状态记为 failed，且 MUST NOT 回滚已成功的 OpenSpec / Polaris / Codegraph 安装。

#### Scenario: GitHub 不可达但 npm 可用
- **WHEN** `git clone https://github.com/obra/superpowers` 因网络失败，且随后 `npx skills add` 也因无法访问 GitHub 失败
- **THEN** Superpowers 状态为 failed，init 流程继续完成其余已成功组件，并向用户输出指向 GitHub 网络/镜像的可操作提示

#### Scenario: GitHub clone 成功
- **WHEN** GitHub shallow clone 成功
- **THEN** 系统 MUST 将 skills 复制到所选平台的 skills 目录，且 MUST NOT 再执行 npx 回退

### Requirement: Git 传输与镜像可配置
系统执行 git 访问 GitHub 时 MUST 默认使用 HTTP/1.1（避免 HTTP/2 framing 类失败）。若设置了镜像基址环境变量，系统 MUST 将 `https://github.com/...` 改写为镜像 URL 后再 clone / ls-remote。

#### Scenario: 默认 HTTP/1.1
- **WHEN** 用户未覆盖 git HTTP 版本相关环境变量
- **THEN** 系统发起的 git 子进程 MUST 携带 `GIT_HTTP_VERSION=HTTP/1.1`

#### Scenario: 配置镜像后 clone
- **WHEN** 用户设置了有效的 GitHub 镜像基址且主站不可达
- **THEN** 系统 MUST 通过镜像 URL 尝试拉取 Superpowers，成功则状态为 installed

### Requirement: Init 摘要按组件汇报失败
init 完成摘要 MUST 区分「平台资产已安装」与「依赖组件失败」。仅当该平台的 Polaris / OpenSpec 安装本身失败时，才将该平台列入平台级失败列表；Superpowers 失败 MUST 单独标明为组件失败，不得单独因此把已成功安装 Polaris 的平台只标为平台失败且不说明原因。

#### Scenario: Polaris 成功但 Superpowers 失败
- **WHEN** 某平台 Polaris 已 installed 且 Superpowers 为 failed
- **THEN** 摘要 MUST 仍列出该平台为已安装（或等价成功路径），并 MUST 单独列出 Superpowers 失败；不得仅输出无解释的「失败：\<平台名\>」而不提及 Superpowers

### Requirement: 失败提示不得误导通道可靠性
当两条通道均因无法访问 GitHub 失败时，系统 MUST 说明两条通道都依赖 GitHub，MUST NOT 声称 npx 回退在国内网络上必然更稳定。

#### Scenario: 双通道均报 GitHub 连接错误
- **WHEN** clone 与 npx 均因无法连接 github.com 失败
- **THEN** 用户可见输出 MUST 提示检查 GitHub 连通性或配置镜像，且不得把失败归因于「仅 Git 通道不可用」
