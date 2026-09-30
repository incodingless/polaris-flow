# polaris-flow 项目记忆

> 只留**跨会话的长期约定与规则**；过程与实测数据进 `YYYY-MM-DD.md`。

## 一、仓库约定（skills 层）

- **命名** `polaris{{SKN_SPR}}<路径各段>`，后缀=目录名；先定目录再定 name。`SKILL_FAMILIES`（源 `layout.ts`）＝coding/debug/prd/prototype/testing，须与 `assets/<lang>/skills/` 同步；漏登记 → 降级顶层叶技能。
- 安装器**只认两层** `family/skill`；第三层被当技能内子目录 → policies 错位 + 断链。
- **技能文件**：frontmatter 只用标准 `description`（≤1024），路由信息只进它；跨技能相对路径必然断链 → 只能按技能名引用（`./policies/…` 由顶层注入）。
- **`assets/` 下所有 README + `PROVENANCE.md` 不入仓**（gitignore + `ignoredFiles`）→ 改它们属**不可 diff 的本地补丁**；`ignoredFiles` 无 `/` 时按 **basename 任意层级**匹配。
- **单源判据**：*改一处是否需要记得改另一处*。**规范只写规则、不写修订史**；负向知识写正面表述。
- **停顿点三类**：决策「暂停等用户选」/ 索要信息「一次问全」/ 停止「报阻塞原因，不得伪造选项」。
- **协议↔阶段技能对接 5 位点**：① 指向协议章节 → ② 给 `state next` → ③ 出口真推游标 → ④ 恢复章节含「恢复依据＝落盘产物」+ policy pointer → ⑤ 层级 C 提示块（取自 `state next`）。终端技能只到 ④ 并声明「链路终点」；`specify`/`retro` 的 `skill: null`。
- **阶段枚举权威**＝`task-kind-layout.ts`（代码，可 diff）；守门件＝各 kind 的 `state.yaml` 模板注释 + `dashboard-api-contract.md` §6.2；`skills/README.md` 一览**不作裁定依据**。
- **游标语义**：`workflow.yaml` 的 `phase` =「接下来要执行的阶段」，阶段技能 Step 0 按自己的阶段名筛；**恢复章节 house style** 以 `prototype/blueprint` 为准，**引用方向单向：技能 → protocol**。
- **metrics 只认顶层 `.polaris/metrics/`（数据丢失级）**：`harness-sync` 不递归，写进 tasks 子目录的文件随 worktree 移除**永久丢失**。
- **严重度口径唯一源**＝`maintance/codereview/references/review-rubric.md` §严重级别定义（**Critical / Major / Minor / Nit**）。全仓已统一（verify 失败决策 / exit-check 项权重 / constitution 违规档 / normal·tweak·build / `subagent-dispatch` 模板）；旧四档 `CRITICAL/IMPORTANT/WARNING/SUGGESTION` **已废弃**，别再写回。**`agents/review/` 仍用 3 档 `Critical/Important/Nice`（另一条轨道，未统一）**——`coding/tasks/SKILL.md` 等处对它的引用保持不变。
- **清理判据**：只找**不承担判据/指令职能**的文字；`>` 引用块与 HTML 契约注释**不是整类豁免**；**无职能的重复两处都删**（有职能才「保其一」）。
- **`assets/zh/policies/*` ＝顶层注入**：`manifest.json` 的 `langContentDirs` 含 `policies` → 安装器按**目录**自动扫描并注入每个叶技能，**无需登记文件名**；跨技能共用规则**只能放这里**（各技能一律 `./policies/<name>.md`，跨技能相对路径会被 install 单测拒收）。同级 `assets/en/` 目前**无 `policies`**（只有 `commands`/`skills`）。

## 二、族内要点

- **prototype**：blueprint → build → ship；`review` 是**服务型技能**（游标永不指向）。产物 `.polaris/tasks/<task_id>/`；**state.yaml 只记身份与指针——产物即状态**。判据唯一源 `review/references/01-quality-criteria.md`，`build` 不复制。
- **debug**：`diagnose` → `patch`（含 1.5 独立验证，仅生产通道）→ `closeout`。跨技能复制 Step 0 时**筛选口径 / 入口校验 / 阶段中文名 / 初始化 phase** 四处必须逐项改写。
- **coding/verify**：五槽 `build|unit|contract|integration|smoke` 由 `shared/scripts/detect-test-command.sh` 探测（退出码 `0` 可用/`1` 探不到/`2` 不可执行，**不得合并**）→ 落 config `test:` 段；＝判定表**唯一可执行实现**。命令获取拆两段（Step 2/9）；覆盖率打分紧跟单测（Step 7）。强度唯一源 `runtime.verify.verify_mode`（顶层同名键已废弃）。**Step 14＝内联的独立评审**：自身派 `subagent-dispatch`（`task_type=code_review`），14.1 H10 探测 → 14.2 圈 diff → **14.3 可选 SonarQube（用户决策点，派发前一次问全）** → 14.4 派发 → 14.5 回读校验+落盘（`reviews/code-review-report.md`）→ 14.6 判定+写 `runtime.verify.codereview_status`；降级 A/B/C **不得默认 A**（降级路径**跳过 14.3**）。**严重度＝rubric 四档 Critical/Major/Minor/Nit**（唯一源见 §一）。
- **flow / 命令层**：询问选项上限 **10**（源 `ask-question-react.md`，flow.md 有副本）；改需求菜单要动 **6 处**；`commands/` 按类分目录，**命令文件无需登记 manifest**。
- **codereview（maintance 族，服务型技能）**：步骤＝**0 范围 / 1 脚本扫描 / 2 SonarQube（可选，本步 2 个决策点：是否启用 + 门禁规则）/ 3 架构 / 4 深度审查 / 5 报告**；**插步/挪步要连带改 `Step N` 引用 13+ 处 + H8 状态行 + 恢复章节 + 退出条件 + 报告模板**。references 两层——通用件 `code-smells.md`（异味，语言无关）/ `security-checklist.md`（**§一 入口速查（任何语言，7 类粗切）/ §二 OWASP 语言无关 8 组 / §三 Java/Spring 专有 4 条**）；Java 专项件 `java-api-design` / `java-code-quality` / `java-concurrency` / `java-database` / `java-performance`（**5 份，安全不在其中**）。归属判据：**语言无关规则留通用件（或 §二），Java 落地（API/注解/配置）才进 java-* 件或 §三**；合并时通用件独有项（CVE 依赖、自研加密、资源可用性/限流）**不得丢**。SKILL.md 引用的 `份数`、description 的清单一览、rubric 的专项列表三处必须同改。**§一 与 §二 是「粗切 vs 细切」，不一一对应**：§二 的「会话 & Cookie」并入 §一.3、「错误处理 & 信息泄露」并入 §一.2、「网络外部请求与跨域」并入 §一.1（SSRF/开放重定向）与 §一.3（CORS/HTTP 方法）、「运行环境与进程」并入 §一.7；§一 另有 §二 未单列的两项（依赖 CVE、资源与可用性）。**§二 新增组时必须同时为它在 §一 找到落点**（映射表写在 `security-checklist.md` §一 的引用块里）。**报告结构（09-29 重排）**＝1 审查概览表（合并建议 / 总体评分 / 发现统计三行在前，再列目标·范围·技术栈·覆盖·静态扫描）→ 2 风险摘要 → 3 SonarQube 门禁（可选，未启用整节删）→ 4 问题清单（**发现 ≥5 条才出**）→ 5 问题明细（Critical/Major **六要素**＝位置 / 风险域 / 现象 / 触发条件 / 后果 / 修复建议；Minor 压缩为三行；Nit 只进表）→ 6 架构评估（可选）。**编号统一 `[F-n]`** 按出现顺序自增（不再按级别分段 `C-1/M-1/m-1`）。**级别定义与处置要求不复制 rubric**——模板只写引用指令，报告作 MR 附件/归档时按 `review-rubric.md` §严重级别定义 **原样引用**一节「级别图例」。**★ 行**（`评审标识` / `执行者`）＝**同一份报告结构被两条通道共用**的接口行——`verify` Step 14 派发的 `reviews/code-review-report.md` 也按这份模板输出（verify 侧只在 `constraints` 指模板 + 要求填 ★ 行，**不复制字段清单**）。`SKILL.md` Step 5 已改为「结构以模板为唯一源 + 两条约束（合并三类来源 / 可核查定位与级别）」，旧的「四要素」表述已删。**不采纳**样例报告的「修复与回归验证要求 / 长期改进建议」两节——修复流程归 `verify` Step 14.6 与用户，本技能只评不改。

## 三、通用教训

- 核验中文用 **Grep 工具（ripgrep）**；macOS grep 对 md 常有假空。
- 沙箱禁 `ps`；git 写操作须 `dangerouslyDisableSandbox` + 先 `rm -f .git/index.lock`；批量删除用 `mv` 移走。
- **Edit 报成功 ≠ 落盘**：改前看 `git status` + mtime，写完读回；**同一文件的多处 Edit 要逐处回读**（09-29 头部一处静默丢失、同轮另一处生效）。
- 技能 md 里**禁止以 `..` 开头的路径字面量**（硬阻断安装测试）。
- **范围约定**：检查 / 清理范围 = **`assets/` 下的 `.md`**；`docs/specs/`、`src/`、`.gitignore` 要动**先问**。
- bash 里 `$VAR` **紧邻中文括号**会被吞进变量名（`set -u` 下直接中止）→ 一律写 `${VAR}`。

## 四、进行中与已知问题（指针）

- **plan of record**：`docs/specs/2026-09-25-verify-test-evidence-design.md`（**09-28 顺序重构**，现行口径见 §十一）；前身 `2026-09-10-verify-redesign-proposal.md` **部分过期**。
- **既有失败测试（勿重复归因）**：存量 **11 条**（清单见 `2026-09-24.md`），只按**同名同因**判断新增。**全量并发跑多出约 9 条假失败**，单跑即绿——先单跑复验再归因。
- **分批提交**：暂存区还留着别的改动时**不要**用裸 `git commit`（会把它一并吞掉）→ 只 `git add` 本次路径再提交。
- **SonarQube 口径已翻案（待同步 spec）**：`docs/specs/2026-09-10-verify-redesign-proposal.md` 写「不引 SonarQube/CodeQL 重型工具，用规则化清单」→ 09-29 在 `maintance/codereview` 新增**可选** Step 2（自适应探测，默认门禁＝Quality Gate FAILED），并**接入 `verify` Step 14 的 14.3**（派发前由主代理一次问全：是否启用 + 门禁规则；结论随 `constraints` 下传 subagent，扫描与门禁在报告内一并给出；subagent 非交互、问不出用户）。该 spec 本就**部分过期**；`docs/specs/` 属「要动先问」范围，未经点头未改。
- **待办与口径指针**：报告《AICoding Verify 最佳实践》**不宜当规范**，只作增量来源。**⑦ tier 已于 09-29 结项**：两轴 `complexity_level` / `risk_level` + 最终值 `current_tier` 落 `state.yaml`（`specify` Step 5.4 初判 → `verify` Step 8 复核只升不降）；信号表唯一源 `assets/zh/policies/risk-signals.md`；`config.example.yaml` **零改动**——其 `tiers.*.path` 是 **polaris-cli 的 verb 枚举**（`change-state-template.yaml` 的 `current_verb`），非本仓阶段名。设计稿 `docs/specs/2026-09-29-risk-grading-design.md`。**遗留**：`state.yaml` 的 `triage:` 块（本仓零读写，但属 cli 血脉）**未删**。
- **两个 `codereview` 的边界（09-29 定）**：`coding/codereview` **已退休删除**（归档 `assets/tmp/backup/coding-codereview-retired-20260929/`）；其「独立 subagent + 独立上下文」机制**内联进 `verify` Step 14**。`maintance/codereview`＝**通用审查服务技能**（主代理执行、**不派** subagent，走 Step 0 范围决策 + 可选 SonarQube）。**二者不可互替**——别再往 maintance 版塞 subagent 派发，也别让 verify 退回主代理自审。`H10` 适用 skill 已加 `verify`（`policies/hard-stops.md`）。
- **`maintance/codereview` 上下文治理（09-30，v0.9.0）**：溢出**只来自两处无上界输入**——Step 1 变更内容读取、Step 4 代码走读（脚本输出 `head` 截断、参考清单触发器闸门、报告模板分级**本就有上界**）。治理三件：① **报告落盘＝进度载体**（唯一源＝「标识约定 · 报告落盘」行；默认与审查目标同目录 `代码审查报告_<目标名>_<YYYYMMDD>.md`；用户可指定路径或声明「仅会话内输出」）；② **Step 4 读取策略＝先定位、后精读**（精读位置 = 脚本命中的 `文件:行` ∪ 走查入口，两处取并集、**不整文件读入**——`analyze.py` 每条 finding 自带 lineno，天然是定位器）；③ **Step 3/4 边产生边落盘 + 分批走读**（分批取文件清单的自然划分，**不引入阈值判据**）。**Step 0 的 H 已写实为「脚本全扫 + 走读抽样」**（旧描述实质承诺读完所有跟踪文件＝设计缺口）。**恢复章节已对齐 `prototype/review` house style**：恢复依据＝落盘产物、Step 1/2 原子段、Step 3/4 有恢复点、用词与提示语模板引用 `auto-transition.md`。**未做（C 路线暂缓）**：接层级 B subagent 派发——若接，须同时改 `templates/review-report.md` 的 `执行者` 取值（现三档无"非裁判 subagent"）与 `hard-stops.md` H10 适用 skill 列。
