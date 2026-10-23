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
- 双语言：先写中文（`assets/zh/skills/`），用户确认后再同步英文。当前英文版暂不处理。**只要 zh 资产变动，就变更版本号**（写 Changelog + bump `package.json` version，不再「待英文同步后补记」）；版本位按 `docs/releases/发布操作指南.md` §一.1：修 Bug/改文案/内部重构=patch、新增命令/能力（兼容旧用法）=minor、破坏性变更=major。英文侧版本位尚未约定，按需再补。
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
- ⚠️ **公司 Nexus 已是 Nexus 3.90.1-01 (COMMUNITY)** @ `http://192.168.103.96:8081`（2026-10-21 用户裁定）。旧 Nexus 2.15.1 @`192.168.2.96` 已退役，其全部实测结论——maven2 provider、tarball 永久 404、packument leaf 死锁、Basic-only 认证、pf-dist 绕行、34 个代理依赖 404——**一律作废，勿再引用**。
  - 三仓布局：`npm-hosted`（发布，只进）/ `npm-proxy`（代理 registry.npmjs.org）/ `npm-group`（聚合读，安装统一走它）；路径 `/repository/<仓库名>/`（无 `/nexus/content/` 前缀）。
  - 认证（Nexus 3 口径）：先启用 `npm Bearer Token Realm`，再 `npm login --auth-type=legacy`（写 `_authToken`，默认 30 天过期，Community 版无过期配置项）；长期发布改 Basic `_auth=base64(user:pass)`（永不过期，两种写法不可并存）。匿名读须给 `nx-anonymous` 加 `npm-group` 的 browse/read。
  - 覆盖同版本 = 仓库 Deployment Policy（Allow redeploy 会静默覆盖）。
  - **仍然有效的教训（版本无关）**：验收判据 = **tarball 可直接下载 + 全新缓存 `npm pack`/`npm i` 通过**；`201` / `+ pkg@ver` / metadata 200 只证明元数据写入，不证明可安装（本机 ~/.npm 缓存会伪装成功，须 `--cache <新目录> --prefer-online`）。
  - 操作细节单源：《docs/releases/发布操作指南.md》通道 A + `release.sh`；记忆不复制步骤。

## 资产类别：bundled-skills vs skills（2026-10-22 起）
- `assets/shared/bundled-skills/<name>/` = **附带第三方技能**：`polaris init` 装到 `platformSkillsDir/<name>/`，**不进 `polaris/` 命名空间、不改 `{{SKN_SPR}}`、不做 policies 注入**，不受「无跨技能 `../` 引用」校验。manifest `sharedDirs` 已登记 `bundled-skills`；安装逻辑 = `skills.ts` 的 **Step 4**（`BUNDLED_SKILLS_DIR`）。
- 判据：**是不是 Polaris 工作流的一个阶段？** 是 → `assets/<lang>/skills/`；只是被顺手调用的工具 → `bundled-skills/`。
- 拷贝走**目录级任务 + `copyDirContents` 的 `shouldCopy` 白名单**（1 任务/技能），既避免逐文件 I/O 随上游体积膨胀，又让 `ignoredFiles`（`PROVENANCE.md`/`README.md`）仍然生效——**不要改成「拷完再删」**，沙箱会拦 node `fs.rm`。
- 当前内容：`archify`（v3.2.0，MIT，已删 `examples/*.html` 12MB）、`diagram-design`（cathrynlavery 上游 v2.6，MIT，全留）。各带 `PROVENANCE.md`（上游 commit/版本/裁剪/升级方式），升级**手动**、不接自动同步。
- 与设计文档的关系：正文图仍是 Mermaid（design 阶段 + 主审 S3.5）；这两个只出**交付图**（HTML/PNG，给人看），不进评审链。

## Windows 支持（2026-10-21 裁定）
- **bash 是硬依赖，非可选**：`assets/shared/hooks.json` 模板、`src/core/install/hooks.ts:62`（硬编码 `bash "…"`）、`doctor.ts:135`、`verify/SKILL.md` 的 scorers 调用，共 27 个 `.sh`。全仓 `grep win32|process.platform` **零结果**（无 Windows 分支）。⇒ Windows 缺 bash 时：安装与 `polaris init` 都成功、**hook 静默失效不报错**。
- 裁定 = **A+B，不做 C**：A 文档分平台 + B 新增 `install.ps1`（`install.sh` 等价物）；C（把 hook/scorers 改写成 Node 跨平台）明确不做。理由：Git for Windows 提供的 `bash.exe` 同时解决 install 与 hook 两件事。
- `install.ps1` 三个必须保持的约束：① 调用 `npm.cmd` 而非 `npm`（PowerShell 的 `npm`→`npm.ps1` 被执行策略拦）；② 文件必须 **UTF-8 BOM + CRLF**（PowerShell 5.1 否则按 ANSI 解析 → 中文乱码）；③ bash 缺失只警告不阻断，且区分「已装 Git 但 `bin` 不在 PATH」与「未装」。
- PowerShell 语法坑：`-split` 单段结果 `[0]` 取首字符 → 用 `String.Split()`；`npm prefix -g` 要 `Select-Object -First 1` 再 `.Trim()`。bash 的「变量后跟中文要 `${}`」坑**不适用**于 PowerShell。
- **安装判据 = 全局目录可写，不是「是否 root」**（2026-10-21，与 Linux `sudo` 同源逻辑）：Windows 官方安装包的 npm 前缀默认 `%APPDATA%\npm`，本来就在当前用户名下、已在 PATH → **不需要管理员**；只有前缀被指到 `C:\Program Files` 类受保护路径才需管理员。判据统一为「装进一个 `polaris init` / `update` 也写得进去的全局目录」，`--prefix` 绕开一律禁止（会得到只能跑 `--version` 的残件）。`install.ps1` 用建临时文件探测（ACL 判断在 Windows 易误判），**目录不存在时向上找最近已存在祖先**再探测（全新 Node 上 `%APPDATA%\npm` 可能尚未创建，否则会误判不可写而拒绝安装）。
- MAX_PATH 无风险：包内最长相对路径 93 + Windows 全局前缀 68 = 161 < 260。
- 已清（2026-10-22）：`assets/` 下 60 个非分发文件（`assets/.workbuddy/` 32、`assets/tmp/` 14、`evals/.work/` 7、`.proto-verify.*.html` 7）已 `git rm` 并加 `.gitignore` 防复发；包内 748→688 文件。`assets/` 整目录进 `files` 且无过滤，往里放东西前先想「这是要发给用户的吗」。

## state.yaml 双层字段语义（2026-10-19 裁定）
- workflow.tdd_mode/build_mode/signals = workflow 层全局决策字段，必须由技能写入（tasks Step 3 / build Step 2.1 / specify 5.4.1 + verify Step 9）；runtime 同名/相应字段（tdd_policy、runtime.build.build_mode 等）= 运行细节记录。两层并存、不裁撤；build SKILL.md「刻意不做全局 tdd_mode」表述与本裁定冲突，待批③修正。
- 顶层 `verify_mode` = 保留且必须写入（verify 定档时与 runtime.verify.verify_mode 成对同步），模板「已废弃不读取」注释待批③改写（2026-10-19 裁定）。
