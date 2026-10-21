# Polaris Flow — 项目长期记忆

## 引用与安装（最高优先，勿回退）
- 命令前缀 `psfl`（`POLARIS_COMMAND_PREFIX`）与技能插件名 `polaris`（`POLARIS_PLUGIN_NAME`）刻意解耦；改命令前缀必须先拆分。
- 引用形态仅两种，不得混用：**技能名** = `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（无斜杠）；**命令名** = `/psfl{{CMD_SPR}}coding{{CMD_SPR}}tweak`（带斜杠）。**「技能名加斜杠」是坏引用**。
- ⚠️ 边界（2026-10-15 用户纠正）：正文里「转交/回退到某技能」（如 ship「终验失败 → 回 verify」）是描述流程逻辑，**合理、不算坏引用**；其中带斜杠只是措辞一致性问题（`/polaris:` 斜杠暗示命令、前缀应为 psfl），非逻辑错误，勿机械清理。
- 技能资产不得反向引用命令（`/psfl:*`、flow 菜单编号 C01/M01 等）；要表达档位用层内表述（`tweak`/`normal`/`strict`）。
- 占位符仅在 skills/commands 域展开；`install/skills.ts` 只替换 `{{SKN_SPR}}`；`{{CMD_SPR}}` 只在命令域。

## 三层架构（权威源 `src/core/config/task-kind-layout.ts`）
- 三层：入口层（tweak/normal/strict 薄编排，只声明档位）→ 调度层 `intake` → 执行层（specify→plan→design(可选)→tasks→build→verify→ship）+ 旁路 retro。
- 执行层唯一入口 = `intake`：不得被直接调用、不得互相调用、不得加载 intake；阶段出口的自动衔接也回 intake。
- 档位序列唯一真相 = `TaskKindLayout.modePhases`：tweak=跳过 plan/design；normal=跳过 design；strict=全序列。
- `workflow.mode` 三值 `tweak|normal|strict`（`full` 已改名，别名已删，存量 full/delivery 不再识别）；中文名「工作流」。
- 档位升降唯一位置 = `specify` 出口（Step 5.5），过即冻结；其余阶段纯按 `skill` 字段转交。

## intake（调度层）
- `task-entry` 原语 = intake 专用（六出口 resume/handover/create/select/resolve-drafts/block）；恢复分发用只读 `get-active-changes`。
- intake Step1–4：恢复分发 → 入口判档（仅零个）→ 任务初始化 → 转交；上游已指定 `task_id` 则跳过枚举（机器交接免提问）。
- 执行层 Step1「接收 intake 交接」：必给 `task_id` + `worktree_path`（空=主仓）；没有则阻断，不得自行枚举在途任务。
- retro = 调度层唯一豁免：不进场序列、不需 `task_id`、由用户直接调用（「看度量/复盘」），intake 不转交它。

## 值域（2026-10-12 裁定，勿再动）
- `complexity_level`/`risk_level`/`current_tier` = `trivial|standard|critical`（方向 critical > standard > trivial）。
- 分级→档位映射单源（`risk-signals.md` §1）：trivial→tweak / standard→normal / critical→strict；技能侧不内联。

## 用户约定
- 配置归代码（禁止 policy 承载配置表）；写 `state.yaml` 一律走 `scripts/task-state-entry.sh`（禁直写 yaml 块）。
- 双语言：先写中文（`assets/zh/skills/`），用户确认后再同步英文；未同步前不写 Changelog。当前英文版暂不处理。
- 候选呈现（用户手定）：单行 `<task_id> (工作流：<mode_label>，阶段：<phase_label>，技能：<skill_label>)`。
- 每轮改动后跑 26/26 技能测试通过方可提交。

## state.yaml 写入（2026-10-16 审计事实）
- **state 不套骨架**：`draft-create.ts:102` 只写 `kind: coding`；`patchTaskStateFile` 的 `?? createDefaultTaskState(...)` 仅在文件不存在时生效 → 实际任务 state **无** `worktree` / `artifact_review_mode` / `runtime.*` 骨架，字段靠增量长出。「字段缺失」是常态，不是异常。
- `createDefaultTaskState`（task-state.ts:517-580）那套默认值（含顶层已废弃 `verify_mode: 'light'`）**实际不落盘**。
- ⚠️ `worktree.ts:141-158` 用 `appendFile` 追加顶层 `worktree:` 块 —— 全仓唯一绕过 task-state-entry 锁与写后校验的 state 写入；state 已有该块时产生重复顶层键，`yaml` 库**直接抛错**（`Map keys must be unique`）→ 该文件此后所有读 op 全挂。
- `set-checkbox` op 已实现「同锁内 tasks.md 勾选 + `runtime.build.{total,completed}_tasks` 原子同步」，但**零消费者**（生效资产里没人调）。
- `runtime.build.pause_reason` 是技能自造字段，未登记进 `state.example.yaml` / 类型。
- `opsx_propose_status` 的正确路径是 `runtime.plan.*`（`propose` 是旧阶段名，`task-state.ts:470` 明示已改名 plan）；写 `runtime.propose.*` 会静默长出孤儿段。
- 已落盘（2026-10-16）：`zh-skills-state-write-fix-plan.md` —— 23 处 AI 直写全部改为 `task-state-entry.sh`（P0 2 / P1 21），涉 build/plan/tasks/verify/ship 五个 SKILL.md。**范围硬边界 = 仅 `assets/zh/skills/coding/**`，未改 src**。
- 判据口径（复用）：凡「state 写入」必须给出 `task-state-entry.sh` 调用；**紧跟脚本调用之后的说明性文字**（如「随后产出 phase: X」）不算直写，但措辞若写成「更新 state.yaml：<字段>」就该收口。
- ⚠️ 底线：涉及 `src/`、`assets/shared/templates/`、其它族的发现，**不得**顺手纳入修复范围（2026-10-16 用户纠正过一次）。

## 测试与工具坑
- 测试族固定 `testing`（不可改 test）；coding 族 12 技能。
- 本机 BSD grep 不支持 `\|`；用 Grep 工具。用户用 Typora 打开 docs 会静默覆盖 AI 写入，写前 `lsof` 查占用。
- `state.example.yaml` 混有用户手改，回退禁用 `git checkout`。
- `packageManager` 必须锁 `pnpm@10.18.3`（= 两处 workflow 的 `pnpm/action-setup` version）。改成 pnpm 12+ 会让本机 `pnpm` 直接崩：pnpm 12 入口改名 `bin/pnpm.mjs`，而 Node 自带 corepack 0.34.6 仍找 `bin/pnpm.cjs` → `prepare`(`husky && pnpm run build`) 失败 → `npm pack`/`npm publish` 全挂（报 `Cannot find module .../corepack/v1/pnpm/<ver>/bin/pnpm.cjs`）。升大版本须同时升 corepack 或独立安装 pnpm，并同步两处 workflow。
- 写 shell：**变量后紧跟中文必须 `${VAR}`**。`"$VERSION，"` 会把全角逗号首字节吃进变量名 → `VERSION<乱码>: unbound variable`（locale 多字节）；`$BRANCH（`、`$VERSION）` 同理。
- `git status --porcelain` 中文路径默认转义成 `\345\217...`，需 `git -c core.quotepath=false status`。
- `.workbuddy/memory/` **被 git 跟踪**（非 ignored）；任何「工作区必须干净」的检查都要 `:(exclude).workbuddy`，否则 AI 每次写日志都会误触发。
- `npm publish` **没有 `--force` 参数**；覆盖同版本靠 Nexus 的 Allow Redeploy（开了会静默覆盖），公网 npm 则根本不允许。
- 发布链路：`release.sh`（根目录）= 通道 A 固化脚本；`npm publish --registry <hosted>` 前 `prepublishOnly` 会跑密钥扫描 + build。
- ⚠️ **Nexus 2.15.1 不能承载 npm 发布（2026-10-21 实测，推翻旧结论）**：公司 `npm-hosted`/`npmjs` 的 provider 是 **maven2**（Nexus 2 官方无 npm 仓库插件，UI 的 Provider 下拉里没有 npm 选项）。`npm publish` 用 CouchDB 协议**只发一次 PUT**（packument + `_attachments` 内嵌 base64 tarball），maven2 存储把整份 JSON 存成**一个文件** `/polaris-flow`（2.1MB），**从不拆出 tarball** → `GET /polaris-flow/-/polaris-flow-0.1.2.tgz` 永远 **404**。
  - 死锁：手工补传 tarball 到 `/polaris-flow/-/...` → **500**（`polaris-flow` 已是 leaf 文件，建不了同名目录）；删 packument 腾位置则 metadata 也没了。静态 raw 仓库同样不可行（文件/目录同名冲突）。
  - 判据教训：**201 / `+ pkg@ver` 只证明 metadata 写入，不证明可安装**。验收必须用**全新缓存**跑 `npm pack` 或 `npm i`（`--cache <新目录> --prefer-online`），否则本机 ~/.npm 缓存会伪装成功 —— 我此前正是被缓存骗过，误判"发布闭环已通"。
  - 可行替代：Verdaccio（动态服务，无路径冲突）或 Nexus 3。

## Windows 支持（2026-10-21 裁定）
- **bash 是硬依赖，非可选**：`assets/shared/hooks.json` 模板、`src/core/install/hooks.ts:62`（硬编码 `bash "…"`）、`doctor.ts:135`、`verify/SKILL.md` 的 scorers 调用，共 27 个 `.sh`。全仓 `grep win32|process.platform` **零结果**（无 Windows 分支）。⇒ Windows 缺 bash 时：安装与 `polaris init` 都成功、**hook 静默失效不报错**。
- 裁定 = **A+B，不做 C**：A 文档分平台 + B 新增 `install.ps1`（`install.sh` 等价物）；C（把 hook/scorers 改写成 Node 跨平台）明确不做。理由：Git for Windows 提供的 `bash.exe` 同时解决 install 与 hook 两件事。
- `install.ps1` 三个必须保持的约束：① 调用 `npm.cmd` 而非 `npm`（PowerShell 的 `npm`→`npm.ps1` 被执行策略拦）；② 文件必须 **UTF-8 BOM + CRLF**（PowerShell 5.1 否则按 ANSI 解析 → 中文乱码）；③ bash 缺失只警告不阻断，且区分「已装 Git 但 `bin` 不在 PATH」与「未装」。
- PowerShell 语法坑：`-split` 单段结果 `[0]` 取首字符 → 用 `String.Split()`；`npm prefix -g` 要 `Select-Object -First 1` 再 `.Trim()`。bash 的「变量后跟中文要 `${}`」坑**不适用**于 PowerShell。
- MAX_PATH 无风险：包内最长相对路径 93 + Windows 全局前缀 68 = 161 < 260。
- 已知残留（未处理）：`assets/zh/skills/prototype/build/evals/fixtures/.proto-verify.*.html` 是测试残留，随 `assets` 入包。

## state.yaml 双层字段语义（2026-10-19 裁定）
- workflow.tdd_mode/build_mode/signals = workflow 层全局决策字段，必须由技能写入（tasks Step 3 / build Step 2.1 / specify 5.4.1 + verify Step 9）；runtime 同名/相应字段（tdd_policy、runtime.build.build_mode 等）= 运行细节记录。两层并存、不裁撤；build SKILL.md「刻意不做全局 tdd_mode」表述与本裁定冲突，待批③修正。
- 顶层 `verify_mode` = 保留且必须写入（verify 定档时与 runtime.verify.verify_mode 成对同步），模板「已废弃不读取」注释待批③改写（2026-10-19 裁定）。
