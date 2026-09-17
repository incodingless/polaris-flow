## Context

当前实现见 `src/core/integrations/superpowers.ts` 与 `src/core/deps/github.ts`：GitHub shallow clone → 失败则 `npx skills add`。`SKILLS_AGENT_MAP` 由 `PLATFORMS.reduce` 用 `platform.name` 填充；skills CLI（`skills@1.5.x`）注册键为 `trae` / `trae-cn` 等小写 id。`displaySummary` 任一组件 `failed` 即把平台名列入「失败」行。实测日志：OpenSpec（npm）成功，GitHub 443 超时 + HTTP/2 framing，npx 同样 clone GitHub 失败。See proposal.md - Why。

## Goals / Non-Goals

**Goals:**

- 修正 agent 映射与摘要语义，使失败信息可操作
- 降低 GitHub HTTP/2 / 镜像缺失导致的可避免失败
- 用最小改动覆盖国内常见「npm 通、GitHub 不通」场景

**Non-Goals:**

- 不把官方 Superpowers 打进 polaris npm 包（体积与许可证另议）
- 不默认依赖第三方汉化包（如 `superpowers-zh`）作为正式源
- 不改 OpenSpec / Codegraph 安装路径
- 不保证在完全封锁 GitHub 且无镜像时仍能自动装上 Superpowers

## Decisions

### 1. Agent 映射用 `platform.id`，不用 `name`

- **选择**：`SKILLS_AGENT_MAP[id] = id`（或显式 `skillsAgentId` 字段，缺省=id）
- **理由**：与 skills CLI `agents` 表键一致；`Trae-CN` 会触发 `Invalid agents`
- **备选**：按 name 再做别名表 → 易与 displayName 漂移，拒绝

### 2. Git 默认 HTTP/1.1 + 可选镜像前缀

- **选择**：`github.ts` 的 `GIT_ENV` 设 `GIT_HTTP_VERSION=HTTP/1.1`（若用户已设置则不覆盖）；支持 `POLARIS_GITHUB_MIRROR`（基址，如 `https://mirror.example/github.com`），将 `https://github.com/obra/superpowers` 改写后再 `ls-remote`/`clone`
- **理由**：日志已出现 HTTP/2 framing；镜像是国内可用的标准逃逸舱，且不引入新依赖
- **备选**：内置 ghproxy 列表 → 不稳定/合规风险，改为用户显式配置；第三方 npm 汉化包 → 非官方，作文档提示即可

### 3. 摘要改为组件维度

- **选择**：`displaySummary` 平台失败仅看 `polaris`/`openspec`；另起一行 `Superpowers 失败：...`（或插件结果列表）
- **理由**：用户日志中 Trae-CN 同时出现在「已安装」与「失败」，误导排障

### 4. 失败文案诚实化

- **选择**：双通道失败时明确「均依赖 GitHub」，附镜像 env 与手动 `npx skills add obra/superpowers -y --agent <id>` 提示
- **理由**：现状注释声称 npx 更适合国内，与实现矛盾

### 5. 第三通道（可选，任务阶段可裁剪）

- **选择**：若实现成本低，支持 `POLARIS_SUPERPOWERS_PATH` 指向本地已 clone 目录，走现有 `installSource`
- **理由**：完全断网时仍可人工拷贝；不依赖新网络路径
- **备选**：打包进 assets → 非目标

## Risks / Trade-offs

- [镜像被滥用/中间人] → 仅用户显式配置；文档警告只信自建/公司镜像
- [HTTP/1.1 略慢] → 可接受；用户可自行设回 HTTP/2
- [仍无法在无 GitHub 时自动成功] → 产品诚实提示 + 本地路径逃逸；不假装已解决墙
- [skills CLI 未来改名] → 单测锁定 `trae-cn` 等 id；detect 提示同步

## Migration Plan

- 无数据迁移；用户重新 `polaris init` / 单独装 Superpowers 即可
- 已装成功的项目不受影响
- Changelog 记录 env 名与摘要行为变化

## Open Questions

- 镜像环境变量最终命名：`POLARIS_GITHUB_MIRROR` 是否足够，或需复用更通用的 git 配置文档约定（实现前与 README 对齐即可，不改规格语义）
