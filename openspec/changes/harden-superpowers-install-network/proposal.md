## Why

`polaris init` 在国内/受限网络下安装 Superpowers 时，GitHub clone 与 `npx skills add` 两条通道都硬依赖 `github.com`，任一不可达则整段失败；同时摘要把「组件失败」误报成「平台失败」，且 npx 回退传入的 `--agent Trae-CN` 与 skills CLI 合法 id（`trae-cn`）不一致。OpenSpec 经 npm 安装成功说明本机并非完全离线，问题集中在 GitHub 依赖与安装契约错误。

## What Changes

- 修正 skills CLI agent 映射：使用平台 id（如 `trae-cn`），禁止用展示名（如 `Trae-CN`）
- 强化 GitHub 拉取韧性：默认 `GIT_HTTP_VERSION=HTTP/1.1`；支持可配置镜像/代理 URL 改写
- 失败时输出可操作提示（网络/镜像/手动安装），不再暗示「npx 在国内一定更稳」
- init 摘要按组件汇报失败（Superpowers 失败 ≠ 整平台失败）
- 保留「Polaris/OpenSpec/Codegraph 已成功则继续」的非阻断行为；可选第三通道（本地目录 / 已缓存路径）若实现成本可控则纳入

## Capabilities

### New Capabilities

- `init/superpowers-install`: Superpowers 在 init/install 中的安装通道、agent 映射、网络失败行为与用户可见结果汇报

### Modified Capabilities

- （无；仓库尚无既有 capability specs）

## Impact

- `src/core/integrations/superpowers.ts`：agent 映射与安装编排
- `src/core/deps/github.ts`：clone 环境变量与镜像 URL
- `src/commands/init.ts`：摘要失败判定
- `src/core/integrations/detect.ts`：安装提示文案对齐
- `test/ts/superpowers.test.ts` 及 init 摘要相关测试
- 用户环境变量（拟议）：`POLARIS_GITHUB_MIRROR` 或等价配置
