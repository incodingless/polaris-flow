---
name: polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview
description: "对用户指定的代码（单个文件 / 目录 / Git 仓库 / 粘贴片段）做系统化审查，输出带优先级分级和具体修复建议的评审报告；覆盖正确性 / 安全 / 性能 / 可维护性 / 架构五维度，识别到 Java/Spring 栈时额外对照五个专项清单（接口设计 / 代码质量 / 并发 / 数据库事务 / 性能），安全维度对照安全检查清单（§二 OWASP 语言无关 / §三 Java 专有）；可由用户选择是否调用 SonarQube 扫描，并按质量门禁等规则判定评审是否通过。用户要求代码审查、代码评审、review 一下、架构分析、技术方案评估，或粘贴代码问「有没有问题」时触发。服务技能，不推进 phase；区别于工作流内对本次 diff 的独立 subagent 评审。"
version: 0.8.4
---

# Polaris 工作流 - 服务技能：代码审查（codereview）

<HARD-GATE>
本 skill **仅**负责：对用户指定的代码做系统化审查，输出一份带优先级分级与具体修复建议的评审报告。它是**服务技能**——不写 `phase`、不写 workflow 游标、不写 metrics、不推进任何阶段。

- **禁止**修改任何被审对象（代码 / 测试 / 配置 / specs）；只评不改
- **禁止**在未阅读代码的情况下，仅凭文件名、路径或调用方描述下结论
- **禁止**报告空泛套话（如「代码质量有待提高」而无具体位置与理由）
- **禁止**捏造不存在的漏洞或过度夸大风险（无依据的问题一律不报）
- **禁止**把脚本粗筛结果当作最终结论——脚本没报 ≠ 安全，深度检查必须逐项人工核查
- **禁止**把 SonarQube（或任何外部扫描）结果当作深度核查的替代——外部扫描没报 ≠ 安全；也不得臆造扫描结果，或把内部脚本结论冒名为 SonarQube 结论
- **禁止**对单个小文件输出数百行的冗长报告（重点优先，Minor / Nit 从简）
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 维护]代码审查 - 进入 codereview Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 维护]代码审查 - 进入阶段：使用 polaris{{SKN_SPR}}maintance{{SKN_SPR}}codereview 技能。`

## 定位与边界

这是「工作流之外的通用代码审查」服务技能：用户随时要求审任意代码时直接触发，**主代理执行**（跑脚本 + 读代码 + 对照清单）。它**不是**工作流内对本次变更 diff 的独立评审——那是 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 14 按 `review_mode` 自行派发独立 subagent 的职责，不在此重造。若用户要求「换个 context 独立审本次 diff」，走 `verify` Step 14。

| 维度 | 本技能（通用审查） |
|---|---|
| 触发 | 用户直接要求审任意代码 / 文件 / 仓库 / 贴代码 |
| 执行者 | 主代理（跑脚本 + 走读 + 对照清单） |
| 审查对象 | 用户指定范围（可含非工作流代码） |
| 外部扫描（可选） | SonarQube（Step 2 询问后启用；探不到则跳过并留痕，不阻断评审） |
| 严重度 | Critical / Major / Minor / Nit（定义见 rubric） |
| 是否推进 phase | **否** |

**刻意不做**（都有明确归属）：
- **修代码**——只评不改，修复交给用户
- **工作流内 diff 的独立裁判评审**——那是 `polaris{{SKN_SPR}}coding{{SKN_SPR}}verify` Step 14 的职责，不在本技能重造 subagent 派发
- **跑测试 / 变异测试 / 性能压测**——本技能只做静态走读与静态扫描（内部脚本 + 可选 SonarQube），不执行测试

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| 审查对象 | 用户指定：单个文件 / 目录 / Git 仓库 / 粘贴片段 |
| 扫描脚本（Python，优先） | `scripts/analyze.py`（AST 静态分析） |
| 扫描脚本（多语言兜底） | `scripts/analyze.sh`（正则扫描） |
| 外部静态扫描（可选） | SonarQube：`mvn -B sonar:sonar` / `./gradlew sonar` / `sonar-scanner`（探测顺序与凭据见 Step 2） |
| 审查维度与严重级别 | `references/review-rubric.md` |
| 安全检查清单（§一 通用速查 + §二 OWASP 语言无关 + §三 Java/Spring 专有） | `references/security-checklist.md` |
| 代码异味目录 | `references/code-smells.md` |
| Java/Spring 专项清单 | `references/java-api-design.md` / `java-code-quality.md` / `java-concurrency.md` / `java-database.md` / `java-performance.md` |
| 报告模板 | `templates/review-report.md` |
| 报告输出 | 默认在会话内输出；用户要求落盘时按用户指定路径写入 |

## 流程

### Step 0 — 确定评审范围（用户决策点）

按 `./policies/decision-point.md` 发起询问。范围共 8 种，超出询问工具有效选项上限（4），走文本降级（`./policies/ask-question-react.md`），逐个列出让用户**单选**：

[决策点 1/1] 本次代码评审的范围？

A 本地工作区 - worktree 中的代码
B 本地暂存区 - 已 git add 未提交的代码
C 单提交 - 单个提交的改动
D 提交区间 - 自由选取一段连续提交
E 分支历史 - 全分支提交序列
F MR 基线差异 - 分支相对 merge-base 的改动（三点）
G 快照直比 - 两端快照直接对比（两点）
H 全量代码 - 仓库全部跟踪代码

请回复编号（如 A）。

**基线（base）**（仅 D / E / F 需要）：用户选 D / E / F 后，再确认基线——默认主干（`git symbolic-ref --short refs/remotes/origin/HEAD`，取不到再试 `main` / `master`）；用户可指定 `origin/develop`、tag、commit。

**技术栈**：若无法从文件类型自动识别，请用户说明语言与框架（Java/Spring 栈命中时 Step 4 加载专项清单）。

### Step 1 — 圈定文件清单并运行扫描脚本

按 Step 0 选定的范围，用对应 git 命令圈定「变更文件清单」并读取变更内容：

| 范围 | 圈定文件清单 | 读变更内容 |
|---|---|---|
| A 本地工作区 | `git diff HEAD --name-only` | `git diff HEAD` |
| B 本地暂存区 | `git diff --cached --name-only` | `git diff --cached` |
| C 单提交 | `git show <commit> --name-only` | `git show <commit>` |
| D 提交区间 | `git log <from>..<to> --name-only` | 逐条 `git show` |
| E 分支历史 | `git log <base>..HEAD --name-only` | 逐条 `git show` |
| F MR 基线差异 | `git diff <base>...<head> --name-only` | `git diff <base>...<head>` |
| G 快照直比 | `git diff <from>..<to> --name-only` | `git diff <from>..<to>` |
| H 全量代码 | `git ls-files` | 脚本 full 模式递归扫描 |

**再运行扫描脚本**（位于本技能包 `scripts/` 目录，按语言选择）：

- **Python 项目**（优先，精确）：`python3 scripts/analyze.py <路径>`
  AST 静态分析，检测：硬编码密钥（赋值/字典/关键字参数）、SQL 注入（数据流追踪，含变量拼接）、命令注入（精确判断 `shell=True`）、不安全反序列化（pickle/yaml）、N+1 查询、可变默认参数、裸 except/吞异常、函数行数、圈复杂度、嵌套深度、魔法数字、未使用导入。
- **非 Python 项目**（兜底，粗筛）：`bash scripts/analyze.sh <路径>`
  正则扫描，覆盖常见安全模式。

**范围 ↔ 脚本衔接**：
- 增量范围（A–G）：脚本用 `--diff` 列变更清单（⚠️脚本 `--diff` 只覆盖 `git diff` 未暂存，暂存区 / 提交类由上方 git 命令圈定，脚本作粗筛参考）；深度审查由 AI 阅读上方圈定的 diff 完成。
- 全量（H）：脚本 full 模式（不传 `--diff`）全量粗筛，AI 做架构级走查。

**非 Git 场景（用户直接粘贴代码片段）**：写入临时文件（`/tmp/review_input.<ext>`，扩展名按语言推断），扫描完成后删除。

- 报「找不到脚本」→ 当前工作目录不是技能目录，按「降级决策」处理。

> 脚本是**粗筛**（AST 版也只能做静态结构分析）。深度安全必须按 Step 4 对照清单逐项人工核查；性能、正确性、架构维度依赖 AI 读代码完成。**脚本没报 ≠ 安全**。

### Step 2 — SonarQube 扫描（可选，用户决策点）

**本步可选**：是否启用由用户决定。「不启用」不阻断评审，只在报告「审查概览」留痕；「启用」则按下方通道探测顺序取结果，并把扫描结论按所选门禁规则并入报告。

按 `./policies/decision-point.md` 发起询问。本步含 2 个决策点（编号为本步内序号）：第 2 个仅在「启用」且扫描成功后问，**跨决策点串行**。

> **被工作流调用时（`verify` Step 14）**：subagent 非交互、问不出用户，两个决策点改由**主代理在派发前一次问全**，结论随 `constraints` 下传，扫描结果与门禁判定在报告内一并给出。通道探测、凭据读取、范围收窄与结果读取口径**不变，仍以本步为唯一源**。

[决策点 1/2] 是否启用 SonarQube 扫描？

A 不启用 — 跳过本步直接进 Step 3；报告记「SonarQube 未执行（用户跳过）」
B 启用 — 先探测可用通道，探到即执行；探不到则报告缺什么并让你决定

**通道探测**（命中即用，不并发）：

| 序 | 命令 | 命中判据 |
|---|---|---|
| 1 | `mvn -B sonar:sonar` | 仓库根有 `pom.xml`，且 sonar 插件或 `sonar.host.url` 可解析 |
| 2 | `./gradlew sonar` | 仓库根有 `gradlew`，且 `build.gradle*` 声明了 sonar 插件 |
| 3 | `sonar-scanner` | `command -v sonar-scanner` 有输出，配置读 `sonar-project.properties` |

**凭据与目标**：`SONAR_TOKEN` 必填（缺失即判该通道不可用）；服务端地址读 `SONAR_HOST_URL` 或仓库内既有 `sonar.host.url`。**只从环境与本仓既有配置读**——不向用户索要 token 明文、不写入任何文件、不新增 `sonar-project.properties`。

**范围限定**：扫描范围必须等于 Step 0 选定的评审范围——用 `-Dsonar.inclusions=`（或既有配置的 `sonar.inclusions`）收窄到范围内的文件；范围是 diff 类（A–G）时只列本次变更文件，**不整仓全扫**，否则会把未变更的旧问题算进本次结论。

**三项都探不到** → 按 `decision-point.md` 的停止条件处理：**报告阻塞原因与恢复条件**（缺哪个命令 / 缺 token / 缺服务端地址），让用户选「补齐后重试」或「改走不启用」。**不得伪造扫描结果，也不得把 `analyze.py` / `analyze.sh` 的结论冒名为 SonarQube 结论。**

**结果读取**：门禁取 `/api/qualitygates/project_status?projectKey=<key>[&branch=<b>]`，问题取 `/api/issues/search`（`resolved=false` + 严重度过滤）。门禁判据**只认服务端返回的 `status`**，技能不自行折算严重度。

[决策点 2/2] SonarQube 门禁规则（仅决策点 1 选「启用」且扫描成功后问）

A 质量门禁 FAILED → 评审不通过（**默认**）— 直接用服务端 Quality Gate 的 PASSED/FAILED
B 存在 Blocker/Critical 问题 → 评审不通过 — 判据在技能侧可见，不看服务端门禁配置
C 仅新增问题 → 评审不通过 — 只卡本次范围内新引入的 Blocker/Critical，与 `verify` 的「仅阻止新增失败」基线口径一致
D 仅记录，不改评审结论 — 结果只进报告

**门禁未过时**：报告「审查概览」的「合并建议」钉为 `❌ 不建议合并`（不得被其他维度的高分抵消），「风险摘要」首句写出门禁未过与所用规则；扫描出的具体问题在 Step 5 与人工发现合并（去重口径见 Step 4「归并」），同一位置同一根因只留一条。

> 扫描是**外部粗筛**，定位与 `scripts/` 相同：它没报 ≠ 安全，Step 4 的逐项人工核查不因此减免；也不把它的结论当作「已覆盖某维度」的理由。

### Step 3 — 架构分析

按范围侧重不同：
- **增量范围（A–G）**：聚焦「变更是否破坏架构边界」——变更是否跨层调用、引入循环依赖、破坏依赖方向、越出模块职责；
- **全量（H）**：基于脚本输出的文件分布与超大文件清单做完整架构审查：
  - **模块边界**：目录 / 包划分是否清晰，职责是否内聚；
  - **依赖方向**：循环依赖、跨层调用、依赖倒置被破坏；
  - **耦合与内聚**：上帝对象、超大文件、散弹式修改迹象。

### Step 4 — 深度审查

只消费四样输入：Step 1 的脚本命中、Step 2 的 SonarQube 结果（若启用）、Step 3 的架构结论、本次被审文件（含粘贴片段）。`review-rubric.md` 只提供五维定义和严重级别。**打开哪些专项以本步触发器为准**；仓库根有 `pom.xml` / `build.gradle` 不构成加载五份 `java-*.md` 的理由。技术栈看被审文件里的 import、注解、XML 和语言。用户已声明审查重点时，只打开与该重点对应的触发器。

**发现必须落在范围内**：
- **增量（A–G）**：落在变更行，或变更直接调用 / 被调用的代码上。变更没碰到的旧代码不报。
- **全量（H）、单文件、粘贴片段**：沿入口、外部输入、持久化、信任边界走。没走到的目录记入报告「审查概览」的审查覆盖，写明未下结论；不写成已检查，也不因此加分或扣分。总体评分只依据已报出的发现。

清单项在代码里没有对应 API 时跳过。看不到项目级机制（例如单文件里没有 `@ControllerAdvice`）不等于项目缺失，审查范围没覆盖应用入口或配置时不报缺失。

**通用路径**（任何语言都走）：
1. **正确性**：逻辑、边界、错误处理、返回值与副作用。只报读到的缺陷。
2. **安全性**：对照 `security-checklist.md` §一（入口速查）/ §二（OWASP 语言无关明细）里与当前代码形态匹配的类——注入、密钥、越权、加密误用、反序列化、路径、SSRF/CORS、会话与信息泄漏。CVE、缺索引、「是否该加缓存」没有外部证据时写入审查覆盖的未下结论项，不报发现。
3. **性能**：出现循环内 IO、查询、无界集合或明显高复杂度时才评估。
4. **可维护性**：只补脚本没覆盖、且在本次范围内看得见的异味（重复代码、死代码、上帝对象、长参数列表）。脚本已报的超长函数、过深嵌套、魔法数字、未使用导入引用 Step 1 结论，不重查。
5. **架构**：不重做。Step 3 的模块边界、依赖方向、耦合结论直接带入 Step 5。

**Java/Spring 触发器**。被审文件命中才打开对应文件的「检查项清单」表；先读该文件的「静态边界」（若有）；正反例只在某一条已经命中时读。未命中的专项不加载，也不写入审查覆盖。

| 代码里出现 | 打开 | 只看 |
|---|---|---|
| SQL / MyBatis / Repository / `@Transactional` | `java-database.md` | 无条件删改、SQL 拼接、事务边界与事务不生效 |
| `Thread` / 线程池 / `@Async` / 锁 | `java-concurrency.md` | 检查项清单（5 条） |
| Controller、对外接口、参数绑定 | `java-api-design.md` | 参数校验、敏感数据、分层职责；鉴权另开 `security-checklist.md` §二 的访问控制 |
| 循环内 RPC / 查库、无界集合 | `java-performance.md` | 高危三条：循环远程调用、N+1、无分页的大结果 |
| `catch`、日志、异常返回调用方 | `java-code-quality.md` | 异常处理、日志规范。命名、注释、魔法数字、方法行数归 `code-smells.md` |
| 注入 API、密钥、路径拼接、反序列化、放开的鉴权 | `security-checklist.md` §二 | 与命中类别对应的检查项；Java/Spring 框架特有项（鉴权注解、Actuator/Swagger、JMX、生产 Profile）见 §三。不可审项进审查覆盖，不报发现 |

**归并**（写入发现前做）：
- 同一位置、同一根因只留一条。脚本已报的引用其结论，不重写推理。
- 安全清单与质量清单冲突时归安全，级别取更高的一级。日志里的密码、证件号是安全问题。
- 事务不回滚、无条件删改归**正确性**。N+1 与循环远程调用归**性能**。分层越界若 Step 3 已写，不重复。
- SonarQube 与人工发现同一位置、同一根因只留一条（人工结论优先）；门禁结论（通过/未通过）不逐条重复计入评分。

**停**：高危面走完即停。小范围 diff 不展开 Nit。禁止为了清单看起来完整而补「建议关注」。

### Step 5 — 输出评审报告

按 `templates/review-report.md` 输出。**报告结构、每条发现的字段、各档详略规则全部以该模板为唯一源**，本步不重述。

本步只定两条模板之外的约束：

1. **合并输出**：Step 1 脚本扫描（与 Step 2 SonarQube，若启用）发现的客观问题，与 Step 3/4 深度审查发现的问题，必须合并为**同一份报告**——不遗漏脚本与扫描已发现的 Critical/Major，也不重复报告同一问题（已报的直接引用结论，不必复述推理过程）。
2. **可核查**：每条发现必须带 `文件:行` 定位与 rubric 四档之一的级别；给不出定位的观察写进「审查概览 · 审查覆盖」的未下结论项，不写成缺陷。

## 质量标准（未达标需返工）

- **零臆造**：每条发现必须有代码依据或脚本/扫描证据，不得凭想象下结论；引用 SonarQube 结论时须带规则 id 与位置，不得转述成自己的判断；
- **分级准确**：严重级别必须与 rubric 定义一致，不得拔高或淡化；
- **可落地**：修复建议必须具体到「改成什么」，而非空泛的「注意安全」；
- **重点优先**：Critical/Major 问题排在前面，详略按模板分级（Minor 压缩、Nit 只进表格）；
- **语言一致**：报告语言与用户输入语言保持一致。

## 降级决策（脚本不可用时）

触发条件：脚本缺失 / 报错无法执行 / 找不到脚本路径。

处理（按序）：
1. 先用 `find` 定位脚本实际路径，改用绝对路径重试；
2. 仍不可用 → **跳过脚本，仅 AI 走读**，并在报告「审查概览」如实标注「脚本未执行，结论仅基于静态走读」；
3. **不得**假装已跑脚本、不得把走读结论冒充脚本证据。

> 脚本是粗筛辅助，跳过**不阻断**审查，但必须留痕。

## 退出条件

- 已按 `templates/review-report.md` 输出评审报告（结构完整：★ 行已填、每条发现带 `文件:行` 与 rubric 级别）
- 未修改任何被审对象
- SonarQube 的启用情况已在报告「审查概览」留痕（未执行含原因 / 已执行含门禁结论与所用规则）
- 未写 workflow 游标 / `phase` / metrics

## 上下文压缩恢复

重载：审查目标（范围 / 重点 / 技术栈）、已跑脚本与结果、SonarQube 的启用情况与门禁结论、已发现的问题清单、停在哪个 Step。

- 停在 **Step 1 之前** → 从明确目标续，勿默认范围
- 停在 **Step 1** → 脚本结果丢失则重跑，勿沿用旧结论
- 停在 **Step 2** → 先看是否已问过「是否启用 SonarQube」；已启用则从扫描/取结果续，勿重跑已成功的扫描；未答过则重新询问，不代答
- 停在 **Step 3 / 4** → 已发现的问题从清单续，勿重复排查已判定的维度
- 停在 **Step 5** → 从合并输出续

## 参考文件

- `@references/review-rubric.md` — 审查维度与严重级别定义
- `@references/security-checklist.md` — 安全检查清单（§一 通用速查 / §二 OWASP 语言无关 / §三 Java/Spring 专有）
- `@references/code-smells.md` — 代码异味目录
- `templates/review-report.md` — 报告输出模板
- `scripts/analyze.py` — AST 静态分析脚本（Python，推荐）
- `scripts/analyze.sh` — 正则扫描脚本（多语言兜底）

Java/Spring 栈专项清单（技术栈识别命中时加载）：
- `@references/java-api-design.md` — 接口设计
- `@references/java-code-quality.md` — 异常处理与日志规范
- `@references/java-concurrency.md` — 并发与线程安全
- `@references/java-database.md` — 数据库与事务
- `@references/java-performance.md` — 性能优化
