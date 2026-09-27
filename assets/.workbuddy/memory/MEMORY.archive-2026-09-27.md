# polaris-flow 项目记忆

> 精简前全文快照：`MEMORY.archive-2026-09-24.md`；更早：`MEMORY.archive-2026-09-17.md`、`MEMORY.archive-skills.md`。
> 本文只留**跨会话的长期约定与规则**；过程记录、修订史、实测数据一律进 `YYYY-MM-DD.md`。

## 一、仓库约定（skills 层）

- **命名** `polaris{{SKN_SPR}}<skills 下路径各段>`，后缀=目录名；先定目录再定 name。安装器按**资产路径**定族/叶，`{{SKN_SPR}}` 只换分隔符。
- `SKILL_FAMILIES`（唯一源 `src/core/assets/layout.ts`）= `coding / debug / prd / prototype / testing`；须与 `assets/<lang>/skills/` 实际目录同步，漏登记 → 降级为顶层叶技能（`constitution`、`subagent-*` 即属此类）。
- 安装器**只认两层** `family/skill`；第三层被当技能内子目录 → policies 注入错位 + 路径断链。领域聚合只能提为一级族或改扁平名。
- frontmatter 只用标准 `description`（≤1024）；路由信息只进 description，执行信息只进正文。
- 跨技能相对路径必然断链，只能按技能名引用；`./policies/…`、`./templates/…` 由顶层 `zh/policies/*` 注入，可用。
- **`assets/` 下所有 README 都不入仓**（gitignore + `ignoredFiles`）→ 改族 README 属**不可 diff、不可评审**的本地补丁。`PROVENANCE.md` 同（2026-09-23 加入）。
- **`ignoredFiles` 匹配语义**：不含 `/` 的模式按 **basename 任意层级**匹配；manifest 是唯一上游，**无需**同步改 `src/core/install/skills.ts:49` 的硬编码兜底。
- **单源判据**：*改一处是否需要记得改另一处*。反例：给停顿点发短 ID + 索引表（ID 是编码不是语义）。
- **规范只写规则，不写修订史**（理由进 commit message / `docs/specs/`）；负向知识保留，但写正面表述。
- **停顿点三类**：真决策点「暂停等用户选」；信息索要「一次问全」；停止条件「报阻塞原因与恢复条件，不得伪造选项」。
- **协议↔阶段技能对接检查法（5 位点，缺一即未对接）**：① 有指向协议的章节 → ② 给出 `polaris-flow state next <change-name>` → ③ 出口真推游标（`update-active --set phase=<下一阶段>`）→ ④ 恢复章节有「恢复依据就是落盘产物」声明 + policy pointer 行 → ⑤ 出口层级 C 提示块，**技能名与括注都取自 `state next`，不得写死**。
  **范围**：终端技能（`ship`、`closeout`）只到 ④ + 声明「链路终点」；`specify` / `retro` 登记 `skill: null`，不参与自动衔接（「属入口阶段」≠「出口不推游标」）。
  **查法**：`grep '--set phase='` 列全部游标写入点 → 对齐 `task-kind-layout.ts` 的 `skillForPhase`。
- **阶段枚举权威**：`src/core/config/task-kind-layout.ts`。两处守门件须同步 = `assets/shared/templates/*.yaml` 的 state 模板注释 + `docs/specs/2026-09-18-dashboard-api-contract.md` §6.2（由 `task-kind-phases.test.ts` 对齐）。**`assets/zh/skills/README.md` 的阶段一览是人读概览、不入仓、不随安装走**，不作裁定依据。
- **游标语义**：`workflow.yaml` 的 `phase` = 「接下来要执行的阶段」；**每个阶段技能的 Step 0 按自己的阶段名筛**。
- **恢复章节 house style**（以 `prototype/blueprint` 为准）：重载行 → 「**恢复依据就是落盘产物**——`state.yaml` 只存身份与指针、不存进度（产物即状态）」→ 分 Step 续跑 → 指向 `./policies/auto-transition.md` 的「压缩时机与恢复清单」。
- **引用方向必须单向：技能 → protocol**（protocol 不得反向引用某个技能）。
- **retro** = 跨变更的只读聚合入口，**不参与 `state next`**；coding 链路终点 = ship。
- **metrics 只认顶层 `.polaris/metrics/`（数据丢失级）**：`harness-sync` 只 `readdir` 顶层、不递归 → 写进 `tasks/<id>/metrics/` 的文件随 worktree 移除**永久丢失**。
- **`assets/**/*.md` 清理判据**：只找**不承担判据与指令职能**的文字；真问题形态＝「尾部死内容」（章节在文末 + 无 Step 指过去 + 无指令职能）。**HTML 契约型注释**（如 `<!-- TDD 任务 -->`）与引用块 `>` **不可清**。查法：对每份文件单独 grep 该章节名，看命中是否只落在它自己。
- **评测器**：每用例须有参照物（应 PASS）+ 反例（应 FAIL），`--selftest` 两边跑；参照物不过先修断言。

## 二、prototype 族

- 分工：`blueprint`（需求理解→《原型蓝图》→人工确认即冻结）/ `build`（设计细化+实现+verify）/ `review`（只评不改）/ `ship`（派独立评审→人工确认→归档）。
- **游标链**：blueprint `--set phase=build` → build Step 6.1 `--set phase=ship` → ship `delete-active`（终点）。
  **`review` 是服务型技能**（ship Step 1 内部派发＝入口 B；用户独立触发＝入口 A / flow R12），**游标永不指向它**，但阶段表登记为普通阶段 → **死映射**。**裁决：不做**（要动契约文档 + 2 个测试 + 分组名），改在 `task-kind-layout.ts` 的 prototype `review` 行上方加注释登记。
- 产物默认 `$REPO_ROOT/.polaris/tasks/$task_id/`，路径写 `state.yaml` 的 `output_dir`。**state.yaml 只记身份与指针，不记进度——产物即状态**。
- 切分判据 §31.1/§31.2：页面数量·范围·批次·深度（PM 拍板）归 blueprint；模式/结构/状态/视觉（专业职责）归 build。
- 判据唯一来源 `review/references/01-quality-criteria.md`（§33/§34/§36）；`build` **不复制判据，按技能名引用**。
- 等级坐标系两套：E1–E5=取证源，L1–L3=三层验证（静态/冒烟/黄金流）。
- `verify.mjs` 只判「有没有」，全绿≠合格；L2 空白壳按渲染后可见文本长度 `vlen` 判，不用 `innerText || textContent` 兜底。
- 脚本共享契约（改一处须同步两脚本）：`<section id>`、`data-goto`、`symbol#i-*` + `use href="#i-*"`、`--text-*`、`window.goto()`；注释里出现这些字面量也判 HARD。
- 三层加载：SKILL.md=流程主干；`references/00-basis.md`=必读（红线阈值已自包含：字号 ≥13px / 对比度 ≥4.5:1，底线由 `verify L1-x` 兜底）；`01`–`04` 按需查，`02` 约 1000 行按尾部「分段路由」读。**脚本判「底线」、正文留「规则」**。
- SKILL.md 统一模板：frontmatter → 标题 → 用途 → 约定 → 启动语 → `## 流程` → Step 0..N → 退出条件 → 上下文压缩恢复 → 尾部（参考文件与工具 + 交付前自检）。
- 改页面机制 / Token 契约 / 脚本判定后须重跑 `evals/run.mjs --selftest`；改任何技能资产后跑 `npx vitest run test/ts/skills-install.test.ts`。

## 三、flow 入口与命令层

- 询问选项上限 **10**，唯一源 `zh/policies/ask-question-react.md`（flow.md 内联一份需同步）。
- 需求菜单：R01 discovery / R02 产品需求 / R03 readiness / R11 制作原型 / R12 评审原型。原型只暴露两入口：R11=`blueprint→build→ship`；R12=`review`。
- 改菜单要动 6 处：菜单 JSON / 已选功能行 / 零步说明 / 阶段链表 / 需求内容消费表 / 前置依赖表。
- **`commands/` 按类分目录**：`coding/{normal,sdd,tweak}`、`prd/{discovery,readiness}`、`maintance/{bugfix,hotfix}`。**命令文件无需在 manifest.json 登记**（靠目录结构自动发现）。
- `build` 完成后暂停等确认，不自动推进 ship（口径散在 4 处）。
- 触发语义分层：`blueprint` 吃总目标语义，`build` 吃接续语义；分不开时 blueprint Step 1.5 用 `blueprint.status==confirmed` 分流。

## 四、debug 族

- `diagnose`（场景分流/问题单/复现保全/RCA/方案 tasks.md）→ `patch`（含 1.5 独立验证，仅生产通道）→ `closeout`；`prove` 已并入 patch。
- 入口在命令层 `zh/commands/maintance/{bugfix,hotfix}.md`，技能层无入口技能。`channel` 只影响加严不影响阶段序列；转移统一走 `skillForPhase`。
- 判据：*若入口只做「预先声明一个下游反正会重判的东西」，它就是多余的*。
- **教训**：跨技能复制 Step 0 时，**筛选口径 / 入口校验 / 阶段中文名 / 初始化 phase** 四处必须逐项改写；`LANG = $(...)` 这种**带空格的赋值**是非法 bash。

## 五、通用教训

- **核验中文用 Grep 工具（ripgrep）**；macOS grep 在双引号里不吃 `\|`。
- **沙箱禁用 `ps`**：这类采集在 agent 沙箱里必然为空 → 脚本必须加预检 + 醒目降级。
- **沙箱内 git 写操作不可用**：`.git/index.lock` unlink 被拦 → 写操作须 `dangerouslyDisableSandbox: true` 且前置 `rm -f .git/index.lock`；`git commit -F - <<'EOF'` 静默失败 → 用多个 `-m`，提交后必查 `git log`。
- **`.polaris/config.yaml` 的键名 kebab / snake 都可读**（`flattenKebabKeys` 把 `-` 转 `_`）→ 模板用 kebab、生成器输出 snake 是风格不统一，不是 bug。
- **fs 批量删除有两层守卫**：① node-safe-delete-shim；② **agent 工具级 safe-delete**（Bash 里 `rm -rf` >50 文件即拦，`scope:turn`）→ 绕法用 `mv <dir> /tmp/<name>-<ts>`（**移走而非删除**）。
- 技能 md 里**禁止出现以 `..` 开头的路径字面量**（硬阻断安装测试）；讲反模式只能写描述性说法。
- **Edit 报成功 ≠ 落盘**：用户并发编辑会覆盖 agent 写入 → **每写完一处必须读回验证**；改文件前先看 `git status` + mtime，不按旧行号下手。
- **判断「新旧副本」必须比内容，不能只看同名**（同名可能是两条并行记忆线）→ 清理前先 `diff`；同名冲突用 `.archive` 后缀留两份，不逐行融合。
- **范围约定（用户明确）**：技能文档的检查 / 清理范围 = **`assets/` 下的 `.md`**；`docs/specs/`、`src/`、`.gitignore` 要动**先问**。
- **跨目录 `mv` 等价于 delete + create** → 会弹删除确认。**还原用 `git restore <path>`**，别用 `mv` 反着搬。
- 「修订史」词表命中多为假阳性（`数据订正`=业务名词、`旧表`=迁移语义、`本轮/上一轮`=运行时评审轮次）→ 看语境，不批量替换。

## 六、进行中与已知问题（只留指针）

- **上下文边界与压缩时机**：`docs/specs/2026-09-22-context-boundary-and-compaction-design.md`。两个唯一源：提示语模板 → `zh/policies/auto-transition.md`「压缩时机与恢复清单」；委派契约 → `subagent-dispatch/references/dispatch-execute.md`。默认 `auto_transition: off`（manual）+ `context_compression: beta`；「清空」= 用户新开会话；agent **无压缩原语**。
- **既有失败测试（勿重复归因）**：2026-09-24 实测 **11 条**——`task-state` 2 / `commands-install` 4 / `agents-install` 2 / `command-adapters` 1 / `openspec` 1 / `file-system` 1 / `init-config` 1 / `generate-polaris-config` 1（另有 `detect.test.ts` 抖动项）。改资产后按**逐条同名同因**判定有无新增失败。
- **未迁移项**：coding / prd / prototype 族未迁移「停顿点三类」写法（debug 族已有）。
- **coding 代码评审落点（2026-09-24 确立）**：新技能 `assets/zh/skills/coding/codereview/` = **服务型技能，不进阶段表、不占游标**（先例 normal / tweak）；由 `verify` 的 `#### 4.3` 按 `runtime.build.review_mode`（standard / thorough）可选调用，执行者＝派**独立 subagent**（复用 `code_review` 任务类型；退化 inline 须标「降级 · 非独立裁判」），报告 `reviews/code-review-report.md`。**刻意只动 verify**：build Step 4 / tweak 5.5 / normal 8.5 的外部依赖保留。
- **verify 增强方案（2026-09-25 设计冻结 → 09-27 可落地，尚未落地）**：**plan of record = `docs/specs/2026-09-25-verify-test-evidence-design.md`**（536 行）。前身 `docs/specs/2026-09-10-verify-redesign-proposal.md` **已部分过期**（其 §3/§4/§8/§9 与 09-24 的独立技能路线冲突，以新文档为准；§2「报告增量三档评估」仍是审查范围原始依据）。
  要点：① 目标＝**三重符合性**（符合需求 / 满足规范 / 正确实现）→ **L4 增强验证划出 v1**；② 测试＝**一次执行 + 三段判读**（增量轨红 → **回 build**，判据是「**本次新增的测试必须绿**」——**不再借用 TDD 论据**，2026-09-27 由用户口径收敛），**不跑两遍**（增量是全量子集）；③ 命令＝**按构建框架探测 → 展示依据 → 人工确认 → 落盘 config**（**config 不手填**；人工给「明确命令」不重探、「线索」才重探，≤2 轮）；④ **只动 verify** —— 09-27 经附 11 修订为「不碰 build / tweak / normal 的既有文本；**可新增 `shared/` 新件**」；⑤ **加子步 `4.0` 不重排**，从 4.2b 抽 5 项但**原位保留计数**（4.2b 仍写 7 项）；⑥ 设计稿已移出；⑦ tier1–3 **挂起**（与既有 `tiers: trivial/standard/critical` 构成双源）。
  **探测落点（2026-09-27 定，**已推翻 09-25「verify 内联」**）**：新增 `assets/shared/scripts/detect-test-command.sh` = **判定表唯一可执行实现**，verify 正文只写「调用它」+ 单测边界增量。契约：入参 `--repo-root` / `--slot`；stdout `key: value`（framework/command/evidence/confidence/excluded）；**退出码 0=可用 · 1=探测不到 · 2=找到但不可执行**（与三级分叉一一对应，**不得合并**）。⇒ 与 `coding/tasks/references/test-review-methodology.md:7-25` 的**双源降级**为「一份实现 + 一份计划期文字描述」。
  **新增 `4.4 人工验证（业务语义确认）`（2026-09-27 定）**：verify 里**唯一的人工「验证者」**角色，置于既有的 `4.3` 之后、决策点之前；**不动 4.2a/4.2b 任何计数**，故不触及两处下游契约。人只判「AI 是否正确理解业务术语、实现是否符合业务规则真实意图」（报告 §5.5.1 第 3 项）；输入＝意图基线 + **术语→实现映射清单** + 机器侧结论摘要；**不做机械性检查**（那是 4.0.3/4.2 的活）。`light`/`full` 都必现，但**允许用户明确跳过 + 原因必填**（`semantics_review=skipped_by_user`），**不得默认跳过**。⇒ 这补上了「人工验证者缺失」这个原缺口。
  附：**超时**＝按框架默认表（无 JVM 300s / JVM 600s，smoke 900s）+ config 覆盖 + **首次超时自动放宽 1 次**；**flaky**＝`retry_and_mark`（重试 1 次 + **强制标注**「首次失败·重试通过」，与报告 §5.4 的偏差**已登记**，config 可改回 `fail_on_flake`）；**无框架**＝按 `verify_mode` 分（light 放行 + 声明、full 阻断），措辞复用既有「项目无测试框架，建议先引入」；**红名单键名**＝`test.baseline.command` / `test.baseline.file`。
  **检测优先级（已修正）**：① 项目根说明文件的 **`## Testing` 章节**（既有明文称「权威来源」）→ ② 清单文件检测 → ③ 已确认 config 值。`Makefile: test` 只是第 ① 序的一种形式。
  **执行顺序（2026-09-26 立，设计文档 §1.4）依据两条，冲突时方向优先**：① 先确认「做的是要的东西」再确认「做得对」（IEEE 1012）→ `4.0.1` 排最前，尽管它靠判断完成；② 代价低/可自动化的先做完、人工只接判断性工作（报告 §5.2「把人类注意力释放给判断性决策」，遵守率 60%→90%）。**边界**：人工接的不是「机器剩下来的全部」—— 机械性残留（环境没起、手工跑一条命令）走 §4.0.4 第 2 级 / `No-Verification`，**不占人工**。
  **（曾用「方向律 / 代价律 / 聚焦律」三律表表述，2026-09-26 用户判「太复杂、玄乎」，已退掉这三个造词，改为上述两条依据；勿再引入。）**
  **人工三角色**：**配置确认者**（4.0.2 命令、4.0.5 红名单）/ **验证者**（`4.4`，09-27 补上，原为缺口）/ **裁决者**（验证失败 / override / 规格漂移）。`4.0.1` 与 `4.4` 同在方向轴：前者是最前的粗粒度闸门（决定要不要往下验），后者是最后的细粒度复核（决定能否放行）。
  **加子步的全部理由＝两处下游契约**：`coding/normal/policies/exit-check.md:85` + `coding/tweak/policies/exit-check.md:87` 引用「verify Step 3.2」；`tweak/policies/exit-check.md:5` 引用「7 项完整验证」。
  实测三段空转：`shared/scorers/test-coverage-scorer.sh` **只读** `coverage/*` 报告文件、**不跑测试**（无报告时退化为「测试文件数 ÷ 实现文件数」）；4.2a 第 4 项「相关测试通过」＝一句话自报告；4.3 评审与测试**无前置关系**。
  ⚠️ **polaris 不记录 base commit**（`state.example.yaml` 的 worktree 段无该字段；`src/core/hooks/worktree.ts` 的 `merge-base` 仅用于 `--is-ancestor`）→ 红名单「跑 base」序需 git 推导，脆弱 ⇒ 故把「人工确认一次」排在它前面。
- **报告对照与可信度结论（2026-09-26 复核，含设计落地后）**：报告《AICoding Verify 最佳实践》**不宜当规范直接落地，只作增量来源**。36 项口径（§5 六层 + §6 分级；剔 §7 工具选型 / §8 路线图）折合 **16.5/36 ≈ 46%**（完整 11 / 部分 11 / 未满足 14；完整=1、部分=0.5）。
  完整满足：AI 幻觉检测（5 种模式全含，codereview#4）、编译+类型、复杂度、双轨测试、生成与裁决分离、需求符合性（意图验收）、副作用/全局状态、退出码+Verification+Verdict、最小改动。
  真缺口：Lint/格式、依赖校验、契约测试、**L4 全部**、证书机制、tier 分级、知识回流。
  **报告四类硬伤（勿照抄）**：① 「存量测试必须全通过」无例外路径，且把**运行期结果写进「前置契约冻结」阶段**（自相矛盾）；② L1–L5 被误排成**线性递进** —— L4 是**测试质量轴**、L5 是人工判断补充，都不是「更严的上一层」；③ 阻塞型 Hook / CI 门禁被列为**技能资产做不到**的一层（仓库实测亦无脚本 `exit` 约定）；④ §4.1 与 §5.6.1 对 TDD **自相矛盾**（Thoughtworks：Agent 内 TDD 无显著差异）→ `4.0.5` 判读 a 的「TDD 绿灯没守住」措辞应改为朴素的「**本次新增测试必须绿**」。
  证据薄弱：98/73/51/29/<7% 是**通过率**却被当作分层依据（证据误用）；70% 杀死率 / 500+ 用例 / 400 行有效性 均无出处；参考表除 IEEE 1012、IBM 外几乎全是 CSDN / 厂商博客 / explainx 等二手内容（报告自述「部分内容由豆包生成」）。
  结构性遗漏：**flaky 与存量红零覆盖**（花了最多力气的部分）；无「归因 → 回修 → 重跑」闭环；成本收益零量化、分级误报后果未提；§5.5.2 证书机制在 agent 流程里**自败**（agent 复述自己的 diff ＝ 自报告）。
