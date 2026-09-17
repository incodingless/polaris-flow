## 1. Agent 映射修正

- [ ] 1.1 将 `SKILLS_AGENT_MAP` 改为按 `platform.id`（或显式 `skillsAgentId`）映射，并修正 `test/ts/superpowers.test.ts` 的 import 路径到 `integrations/superpowers`；验证 `buildSuperpowersInstallCommand('project', ['trae-cn'])` 产出 `--agent trae-cn`
- [ ] 1.2 同步 `detect.ts` 中 Trae-CN 安装提示为 `--agent trae-cn`；验证相关文案测试或快照（若有）通过

## 2. Git 韧性

- [ ] 2.1 在 `github.ts` 默认注入 `GIT_HTTP_VERSION=HTTP/1.1`（不覆盖用户已有值）；单测或通过导出 env 构建函数验证
- [ ] 2.2 实现 `POLARIS_GITHUB_MIRROR` URL 改写并用于 `resolveVersion`/`fetchRepo`；单测覆盖「有镜像 / 无镜像」两种 URL
- [ ] 2.3 （可选）支持 `POLARIS_SUPERPOWERS_PATH` 本地目录走 `installSource`；单测验证跳过网络且 status=installed

## 3. 失败提示与摘要

- [ ] 3.1 双通道失败时输出诚实提示（均依赖 GitHub + 镜像/手动命令）；验证失败路径日志断言
- [ ] 3.2 调整 `displaySummary`：平台失败仅看 polaris/openspec；Superpowers 失败单独成行；验证「Polaris installed + Superpowers failed」用例输出符合规格

## 4. 文档与收尾

- [ ] 4.1 README / README-zh 补充镜像与本地路径说明；核对与 env 名一致
- [ ] 4.2 更新 CHANGELOG，按需 bump 相对 master 的 patch/minor；跑 `pnpm test` 中 superpowers / init 相关用例通过
