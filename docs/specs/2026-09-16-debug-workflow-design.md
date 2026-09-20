# 缺陷修复工作流契约设计（debug 族）

> ⚠️ **阶段名部分已作废**（2026-09-17 三阶段合并；2026-09-20 加此标注）
>
> 本文档 §2 的**六个阶段原子**已成历史：`triage` + `diagnose` + `prescribe` 合并为单一
> `diagnose`；`prove` 并入 `patch` 的 1.5 步（生产通道的独立验证节）。最终只剩
> **`diagnose` → `patch` → `closeout`** 三个阶段。
>
> - 阶段名以 `assets/zh/skills/debug/README.md` 为准（该 README 亦声明本文档「成文于六段时代」）
> - 合法阶段值的**唯一真相**是 `src/core/config/task-kind-layout.ts` 的阶段表；
>   写入时由 `workflow-entry` / `task-state-entry` 校验（`triage` 等旧名会被拒）
>
> 本文档其余内容（双通道差异、人在环门禁、加严项、产物流转表、命名取舍）**仍然有效** ——
> 作废的只是阶段名与阶段数。之所以保留正文而不删除：它是那些设计取舍的唯一记录。

日期：2026-09-16  
状态：已定稿（已实现）· 无待决 —— **但阶段名以 debug README 为准，见上方标注**  
范围：本轮冻结六个阶段原子、测试通道的完整装配，以及生产通道的原子集与装配顺序；生产通道的原子集、装配顺序、加严项与人在环模板（批 6 已完成）

## 背景

现状 `debug/bugfix` 是一个单技能内的 6+1 步流程，存在四个结构性问题：

1. **无法与生产通道复用**：阶段逻辑（复现、根因、验证、交付）与生产通道高度重合，但只能各写一份，改一处要改两处且必然漂移。
2. **阶段边界过密**：`Step1|Step2`、`Step6|Step7` 之间没有真实分叉、没有人确认点，多出来的边界只增加门禁措辞、回流路径与"回流到哪一步"的歧义。
3. **样板重复**：入口引导、活跃任务恢复、决策点协议、能力分档、硬约束全部内联在 SKILL.md 里。对照 prototype 族的实测：4 个叶技能各自重写入口，`PLUGIN_ROOT` 校验从 4 次**漂到 1 次**，已经不一致。
4. **运行态初始化引用错工具**：`scripts/workflow-entry.sh --phase bugfix` 既缺必填的 `<op>`/`--skill`/`--kind`，又用错了工具——`workflow-entry` 只读写 `.polaris/workflow.yaml`，从不创建任务目录与 `state.yaml`。

本设计把该通道重做为**契约先行**的阶段原子 + 叶子技能，并明确每道门禁的**判定依据归谁**。

## 目标

1. **六个阶段原子**：`triage` → `diagnose` → `prescribe` → `patch` → `prove` → `closeout`；测试通道装配其中五个（不装 `prove`），生产通道全装。每段有可自证的出口。
2. 阶段逻辑拆为叶子技能，两条通道共用；阶段细节只写一次。
3. 跨技能样板下沉到 `policies/`，零重复、不漂移。
4. 运行机制支持「按通道建 phase→skill 表」与「phase 可回退（跨技能回流）」。
5. 契约可机械核对：产物路径、出口门禁、回流目标、人确认点全部写死。

## 非目标

- 不改 `coding` / `prd` / `prototype` 族的既有约定。
- 不建"编排大技能"，不引入中心路由表（路由由各叶技能的 `description` 承担）。
- 不做工单系统对接、不做知识库检索后端（同类复用是文件索引，不是服务）。

## 一、阶段定义

| 序 | phase | 中文显示名 | 装配 | 目标 | 入口依赖 | 产物 | 出口门禁 | 判定依据归谁 | 不过则回流 |
|----|-------|-----------|------|------|---------|------|---------|------------|-----------|
| 1 | `triage` | 定性 | 两通道 | 把口述现象变成**可核对的证据**，并分流场景 | 用户口述 / 工单 / 告警描述 | `diagnose-brief.md`：缺陷信息 + 四要素 + 证据提取 + 复现段（**过程档案**） | 四要素齐全；稳定复现（连续 ≥3 次同结果）；场景分流判定为测试 | 技能自证 | 原地：向用户补信息 |
| 2 | `diagnose` | 定位 | 两通道 | 确认**根因**（不是报错点） | `diagnose-brief.md`（复现段） | ① 回填 `diagnose-brief.md`「根因」段与「修复方向（影响面 / 回归范围）」；② 产出 **`reviews/rca-report.md`（根因分析报告 RCA，成品，九节见 §2.3）** | 报错点 ≠ 根因（定位到最早引入异常的节点）；解释**全部**现象；≥1 个替代假设的排除记录；**报告中每项结论都能在档案里找到对应证据** | 技能自证 **+ 人确认（对象是 RCA 报告）** | 回 `triage` 补证据 |
| 3 | `prescribe` | 方案 | 两通道（测试可折叠） | 确定**修复边界与回退路径** | `reviews/rca-report.md`（根因、影响面与发现路径）+ `diagnose-brief.md`（排除记录明细） | `tasks.md`（含改动点清单、回归范围、TDD 标注）+ 回填简报「修复方向」 | 影响面逐项判断；回归范围只增不减；`tasks-lint` 通过；改动边界明确含"不做什么"；**生产通道另有"回退路径可行"硬门禁** | 技能自证 **+ 人确认（仅存在分叉时）** | 回 `diagnose`；范围超界 → 退出本通道转 `normal` |
| 4 | `patch` | 实现与自验 | 两通道 | 改到位，并由**改代码的人自己**证明 | `tasks.md` | 修复代码 + 新增用例 + `verification.md`「自验」节 | 先红后绿；核心边界用例 ≥2 条；回归全通过；`git diff` 全部落在改动点清单内；静态检查通过 | 技能自证 | 代码错 → 段内重改；**方案错 → 回 `prescribe`** |
| 5 | `prove` | 独立验证 | **仅生产** | 由**独立环境 / 他人**证明改对了，且退得回去 | 修复代码 + 类生产或预发布环境权限 + 存量数据样本 | 回填 `verification.md`「独立验证」节（含人回填结果） | 五维通过：功能回归 / 数据兼容（含脚本重复执行）/ 性能基准无退化 / 边界与异常 /**回滚演练有效** | **人回填 + 技能判定** | 止于实现 → 回 `patch`；方案不成立（含回滚无效）→ 回 `prescribe`；与根因结论不符 → 回 `diagnose` |
| 6 | `closeout` | 关闭Bug | 两通道 | 可交、可追溯 | 全部上游产物 | `reviews/bugfix-report.md`（含提交信息文本 + 评审要点）+ 归档副本 + `INDEX.md` 行 | 出口门禁清单逐项通过；**回读校验**通过（3 个归档文件 + `INDEX.md` 存在且非空）；生产通道另有发布就绪确认 | 技能自证；**提交动作由人决定** | 缺项 → 补齐重校；发现结论错 → 回 `diagnose` |

**人确认**：测试通道 1–2 处（§3.2）；生产通道另有"发布确认"（§8）。**`closeout` 段的提交动作不由技能执行**（§5.3）。

### 1.1 命名约定

六个 id 一次性选定，理由是**形象 + 两通道通用 + 避开已占用的 phase**：

| phase | 为什么用这个词 | 约束说明 |
|-------|--------------|---------|
| `triage` | 急诊分诊：接案、定级、决定往哪走——正好覆盖"四要素校验 + 场景分流"两步 | 两通道通用（测试＝接缺陷，生产＝接故障）；**刻意不用 `repro`**，因为生产通道复现只是可选项 |
| `diagnose` | 诊断：与"根因"语义直接对应，比缩写 `rca` 有画面 | 须承载「报错点 ≠ 根因」与「排除反证」 |
| `prescribe` | 开方：给出补救方案，天然含"有代价、可回退"的意味 | 须承载「边界 + 回退路径」，**不是**任务清单；`plan` 已被 coding 族占用 |
| `patch` | 行业惯用：打补丁 | 这个词只覆盖"改"，**不显"验证"**——故 ④ 的出口门禁必须显式包含**自验**项（红→绿、边界 ≥2、回归、diff 无夹带），否则名字会诱导"只改不验" |
| `prove` | 证明：由**环境或他人**证明修复有效，与 `patch` 的"自己证明"形成对照 | 与 `patch` 押韵、同为单音节；`verify` 已被 coding 族占用，故不用 |
| `closeout` | 项目管理的"结项"：报告 + 归档 + 索引，一步到位 | 刻意不用 `deliver` / `ship`——`ship` 已被 coding 族占用，且"交付"含义过泛，不含归档 |

**刻意避让**：`plan`（coding）、`tasks`（coding）、`design`（coding）、`build`（coding/prototype）、`verify`（coding）、`ship`（coding/prd/prototype）、`review`（prd/prototype）、`blueprint`（prototype）。同族内 `bugfix` / `hotfix` 是通道技能，与阶段技能不在同一层。

**id 与显示名解耦**：中文显示名可继续沿用习惯说法；英文 id 是目录名、命令名、`state.yaml` 的 phase 值与 `PHASE_TO_SKILL` 的 key，改名即改这四处（§9 待决 1）。

## 二、产物与目录契约

运行态一律落 `.polaris/tasks/<issue_id>/`：

| 文件 | 归属段 | 说明 |
|------|--------|------|
| `diagnose-brief.md` | `triage` 建、`diagnose`/`prescribe` 回填 | **过程档案**：原始证据、调研路径、中间结论与失败尝试；只追加、不美化，禁止转述 |
| `reviews/rca-report.md` | `diagnose` 建 | **根因分析报告（RCA，成品）**：人确认根因的对象、`prescribe` 的输入；九节结构见 §2.3 |
| `tasks.md` | `prescribe` 建（折叠时由 `patch` 建） | 必须过 `tasks-lint` |
| `verification.md` | `patch` 建「自验」节；`prove` 回填「独立验证」节 | 命令 + 原始输出 + 结论，三件套；一份文件、两段分写 |
| `reviews/bugfix-report.md` | `closeout` 建 | 交付结论报告（**根因与证据链引用 `rca-report.md`，不重述**）；`reviews/` 需 `mkdir -p` |
| `state.yaml` | 初始化时建 | 运行态与回退留痕（§4.2） |
| `.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json` | `closeout` | 时间戳叠加，不覆盖 |

归档：`docs/troubleshooting/<issue_id>/`（扁平放 `diagnose-brief.md` / `rca-report.md` / `tasks.md` / `bugfix-report.md`，**复制不移动**），并追加一行摘要到 `docs/troubleshooting/INDEX.md`。归档**回读校验 5 项**（4 个文件 + `INDEX.md`）。

### 2.1 分段回填写明表

每段**只允许**回填自己负责的节，禁止跨段改写上游结论：

| 文件 | 节 | 写入段 |
|------|----|--------|
| `diagnose-brief.md` | 缺陷信息（含 `历史同类`） | `triage` |
| `diagnose-brief.md` | 输入四要素 / 证据提取 / 复现 | `triage` |
| `diagnose-brief.md` | 根因 / 排除记录 / 解释范围 | `diagnose` |
| `diagnose-brief.md` | 修复方向（改/加/删、影响面、回归范围） | `diagnose` 起草，`prescribe` 定稿 |
| `verification.md` | 自验（命令 + 原始输出 + 结论） | `patch` |
| `verification.md` | 独立验证（五维 + 人回填结果） | `prove` |

`reviews/rca-report.md` 由 `diagnose` **独写**（不涉及分段回填）；下游只读取引用，不得改写。

若下游（`prescribe` / `prove` / `closeout`）发现上游结论有误：**回退到该段重出**，并在 `state.yaml` 留痕；**不得**就地改写。

### 2.2 过程档案与成品报告的分工

诊断段是全流程唯一"调研量大"的段，故**过程与成品分离**；其余段不重复这套机制。

| | `diagnose-brief.md`（过程档案） | `reviews/rca-report.md`（成品报告） |
|---|---|---|
| 给谁看 | 技能与自己——下一步要复用这里的原始材料 | 给人确认根因、给 `prescribe` 当输入、随交付归档 |
| 内容 | 原始证据原样、调研路径、中间结论、**被推翻的假设与失败尝试** | 九节自洽结构，见 §2.3 |
| 允许乱 | 允许自相矛盾、允许留废稿；**只追加不删** | 不允许：一句话一个结论，无证据不写 |
| 硬关联 | — | **报告中每项结论都必须能在档案里找到对应证据**（引用节名） |

**两条防退化规则**：

- **档案禁止被美化**——把过程档案整理成漂亮文档，等于原始证据丢失，事后既不能复盘也没法支撑同类复用；中间结论与失败尝试要留着，防重复踩坑。
- **报告禁止变流水账**——"我试过什么、又失败了什么"属于档案，不进报告；报告只写结论与证据指向。

### 2.3 RCA 报告的结构与硬约束

`reviews/rca-report.md` 是**根因分析报告（RCA）**，不是"根因结论页"。九节固定结构：

| # | 节 | 要求 | 通道差异 |
|---|----|------|---------|
| 1 | 摘要与影响面 | 一句话现象 + 受影响范围 | 通用 |
| 2 | 时间线 | 异常起始 / 扩散 / 峰值 / 恢复，**显式对齐时区** | **生产必填**；测试通道标注"不适用" |
| 3 | 根因 | **直接原因与根本原因分开写**；`文件:行` + 逻辑错误说明 | 通用 |
| 4 | 证据链 | 栈溯源路径、变更关联、日志与指标引用（指向档案节名） | 通用 |
| 5 | 排除记录 | ≥1 个替代假设 + 排除依据；未能排除的如实写"未能排除" | 通用 |
| 6 | 解释范围 | 覆盖哪些现象；未解释的残留现象显式列出并标注归因未知 | 通用 |
| 7 | **发现路径**（为何没被更早拦住） | 用例没覆盖？参数校验缺失？监控未告警？环境差异？——这一节**直接产出"该补哪条用例"** | 通用 |
| 8 | 结论置信度与未决项 | 置信度分级 + 建议补的观测手段 | 通用 |
| 9 | **改进项（不在本次范围）** | 补用例 / 补校验 / 补监控 / 补文档 | 通用 |

**第 9 节硬约束：只登记、不执行。** 改进项**不进入本次改动范围**，归档后供后续排期。理由是"最小变更"属不可弃原则——把改进项塞进本次修复会让范围失控，那正是"修一个带两个"的成因；`patch` 段的 diff 校验应据此把改进项视为夹带并回退。

**命名说明**：phase id 用 `diagnose`（形象、可读），报告文件名用 `rca-report.md`（行业通用词、零歧义）——**phase 命名与文件命名不必同源**，前者服务于流程可读性，后者服务于工具与检索。

**迁移项**（批 4/5 落地）：现有 `debug/bugfix` 的 `explore-brief.md` 引用（SKILL 约 8 处 + 两个模板 4 处）与 `test/ts/commands-install.test.ts` 的断言需同步改名；`reviews/rca-report.md` 为新增产物，`closeout` 的出口门禁与归档清单从 3 份变 4 份、回读校验从 4 项变 5 项。

## 三、门禁与人确认

### 3.1 门禁清单

每段一个出口门禁，判定依据只有三种来源：**技能自证**（命令 + 输出可复核）、**人确认**（对结论做判断）、**人回填**（人在自己环境执行后回填结果，技能据此判定）。

| 门禁 | 位置 | 判定依据 | 不过的处理 |
|------|------|---------|-----------|
| 定性门禁 | `triage` 出口 | 技能自证 | 列出信息缺口清单，原地补；禁止"改代码试试" |
| 定位门禁 | `diagnose` 出口 | 技能自证 + 人确认 | 回 `triage` |
| 方案门禁 | `prescribe` 出口 | 技能自证 + 人确认（仅分叉时） | 回 `diagnose` 或退出通道 |
| 实现与自验门禁 | `patch` 出口 | 技能自证 | 段内重改，或回 `prescribe` |
| 独立验证门禁 | `prove` 出口（仅生产） | **人回填 + 技能判定** | 回 `patch` / `prescribe` / `diagnose`（见 §1 表） |
| 关闭门禁 | `closeout` 出口 | 技能自证 | 补齐后重校；**不得宣告完成** |

### 3.2 人确认点（测试通道共 1–2 处）

1. **根因确认（必选）**：`diagnose` 出口，**确认对象是 `reviews/rca-report.md`（根因分析报告）**，不是过程档案。选项：`A 根因正确，进入方案` / `B 根因存疑，回 triage 补证据` / `C 场景判断有误，改走其他通道`。
2. **方案确认（仅存在分叉时）**：`prescribe` 出口。唯一路径时不询问，直接进 `patch`。

`prove` **不引入新的人确认点**——它的门禁是"人回填 + 技能判定"，回填不等于确认。生产通道另有"发布确认"（§8）。

**未获确认不得进入下一段**，也不得"先把代码改了再确认"。

## 四、回流规则

### 4.1 回流矩阵

| 从 | 触发条件 | 到 |
|----|---------|-----|
| `triage` | 复现不稳 / 四要素缺项 | 原地（补信息）；无证据且偶发 → 停止修复，建议补观测后重新提单 |
| `diagnose` | 全部假设被排除 / 现象解释不全 | 回 `triage` |
| `diagnose` | 根因其实是需求有误 | 退出通道 → `coding/normal` 或 `coding/tweak` |
| `prescribe` | 改动跨 3+ 模块 / 需 schema 或数据迁移 / 对外 API breaking | 退出通道 → `coding/normal` |
| `patch` | 用例失败，止于代码实现 | 段内重改 |
| `patch` | 用例失败，方案本身不成立 | 回 `prescribe` |
| `prove` | 验证项不通过，止于实现 | 回 `patch` |
| `prove` | 验证项不通过，方案不成立（含回滚无效） | 回 `prescribe` |
| `prove` | 现象与根因结论不符 | 回 `diagnose` |
| `closeout` | 交付物缺项 | 原地补齐 |
| 任意段 | 命中生产信号 | 退出通道 → 生产通道（`hotfix`，见 §8） |

### 4.2 回退留痕

`state.yaml` 记录 `regressions[]`：`from` / `to` / `reason` / `at`。同一目标回退 ≥2 次必须在报告「未覆盖项」中标注——反复回退通常说明定性或定位没有真正完成。

## 五、技能切分与装配

### 5.1 叶技能清单（8 个）

| 技能 | 类型 | 职责 | 本轮 |
|------|------|------|------|
| `debug/triage` | 阶段 | 定性 | 建 |
| `debug/diagnose` | 阶段 | 定位 | 建 |
| `debug/prescribe` | 阶段 | 方案 | 建 |
| `debug/patch` | 阶段 | 实现与自验 | 建 |
| `debug/prove` | 阶段 | 独立验证（仅生产装配） | 建 |
| `debug/closeout` | 阶段 | 关闭Bug + 沉淀 | 建 |
| `debug/bugfix` | 通道 | 测试通道装配 | 建 |
| `debug/hotfix` | 通道 | 生产通道装配 | 预留 |

**硬规则**：通道技能内**不得出现任何阶段的执行细节**（不得写"怎么复现""怎么跑 lint"），只能声明装配顺序、档位、加严项与人确认点，并引用阶段技能名。否则它会重新长成第二份大 SKILL.md，复用当场失败。

### 5.2 通道装配表

```
测试通道（bugfix）：triage → diagnose → prescribe（可折叠）→ patch → closeout
生产通道（hotfix）：triage → diagnose → prescribe → patch → prove → closeout
```

`prove` **只出现在生产通道**：测试环境没有"类生产"这一层，自验即终验。

**折叠条件**（仅测试通道）：`prescribe` 与 `patch` 之间无分叉（唯一可行路径）+ 改动不跨模块 + 不触发 §4.1 的退出条件。生产通道 `prescribe` **不可折叠**（回退路径是硬门禁）。

**折叠时仍必须**：产出 `tasks.md` 并过 `tasks-lint`；影响面与回归范围仍写进简报；**不跳过方案确认**的判断逻辑本身（无分叉即无需询问）。折叠只表示"不在独立技能实例里执行"，不表示"方案可以不做"。

### 5.3 技能不做的事

- **不执行** `git push` / 分支合并 / PR；`git add` / `commit` 仅在用户明确选择后执行。
- **不执行**任何生产操作、不主动读取生产环境、不声称已执行未执行的动作。
- 不把"建议 X"写成"已 X"。

### 5.4 `patch` 与 `prove` 的切分依据（已定：拆）

**切分点不是"写代码 vs 跑测试"，而是「自验」与「他证」**——这是两者唯一不重叠的边界：

| 维度 | `patch` 自验 | `prove` 独立验证 |
|------|-------------|----------------|
| 谁执行 | 改代码的人，同一会话 | 另一角色（QA / 运维 / DBA），另开会话 |
| 在哪执行 | 开发工作区 | 类生产 / 预发布 / 生产观测窗口 |
| 验什么 | 红→绿、核心边界 ≥2、回归范围、`git diff` 无夹带、静态检查 | 功能回归、数据兼容与脚本重复执行、性能基准、**回滚演练**、观测指标就位 |
| 能力档位 | A 档（技能自跑自证） | **B/C 档为主**（依赖环境与权限，大量项由人执行后回填） |
| 失败模式 | 代码写错 / 写超范围 | 修复无效、性能退化、数据不兼容、**回滚无效** |
| 回流目标 | 自己（段内重改）或 `prescribe` | `patch` / `prescribe`，甚至 `diagnose`（根因判断本身错） |
| 判定依据 | 技能自证 | 人回填 + 技能判定 |

**决定理由**（三条判据）：

1. **独立出口 + 独立证据** → 成立：两者产物内容不重叠；
2. **两通道差异化方式不同** → 成立：`prove` 只在生产通道装配；
3. **会被单独进入** → **成立（已确认）**：生产通道的独立验证由不同角色、另开会话执行。那个人手里只有"验证"这一件事，**不该被塞进"改代码"的上下文**。

另有一条实务理由：合并后验证会退化成"实现段的出口"，**回滚演练这类重动作会被省掉**——独立成段才有地方落"回滚有效"这条门禁。

**被放弃的折中方案**：保持单一 `patch` 技能、把独立验证做成段内门禁与小节。它在同人同会话时够用，但解决不了"另一个人另开会话进入"的场景，故不采用。

## 六、运行机制改动（批 2 输入）

### 6.1 `PHASE_TO_SKILL` 按通道建表

现状（`src/core/hooks/state-next.ts:59`）以 **family（kind）** 为 key，一个 family 一张 phase→skill 表。debug 族是**两条通道 × 两套阶段序列**（`bugfix` 折叠 `prescribe` 且跳过 `prove`），一张表表达不了"下一段是谁"。

改法二选一：

- **A（推荐）**：映射 key 从 family 提升为**通道**，family 退化为聚合桶；
- **B**：允许 `PHASE_TO_SKILL[family]` 下按通道分表。

**已选 B（批 2 落地）**：`WorkflowTaskEntry` 新增 `channel` 字段（仅 debug 族使用），`state-next.ts` 以独立的 `DEBUG_PHASE_TO_SKILL[channel][phase]` 表达两条通道的序列；`resolveNextSkillName(kind, phase, channel)` 在 `kind === 'debug'` 时走该表。`channel` 由通道技能在 `append-active --channel bugfix|hotfix` 时写入游标。

### 6.2 任务类型：新增 `debug` kind（已定）

**决定**：新增独立 kind `debug`，不复用 `coding`。理由：bugfix / hotfix 都不需要 `draft-*` 临时目录（`usesDraft: false` + 显式 `--task-id` 直建），复用 `coding` 会与 coding 的 draft 流程纠缠，且 `coding` 的 init 补丁会写入 `phase=specify` / `intention_path` 等与本通道无关的字段。

**改动面**（批 2 逐项落地）：

| 位置 | 改动 |
|------|------|
| `src/core/config/workflow-state.ts` | `WorkflowTaskKind` 与 `WorkflowTaskListKey` 加 `debug` / `debug_tasks`；`WorkflowState` 加字段；`listKeyForKind`、`parseWorkflowTaskKind` 加分；默认状态、`normalize`、空文件模板串、清理逻辑四处同步 |
| `src/core/config/task-kind-layout.ts` | `TASK_KIND_LAYOUTS.debug`：`storageSegment: 'tasks'`、`initialPhase: 'triage'`、`stateTemplate: 'debug-state.example.yaml'`、`usesDraft: false`；init 补丁写 `runtime.triage.status` / `runtime.triage.started_at`（**阶段名，非通道名**；`channel` 由通道技能在 init 后经 `task-state-entry set` 写入） |
| `assets/shared/templates/debug-state.example.yaml` | 新建（参照 `testcase-state.example.yaml`） |
| `src/core/hooks/state-next.ts` | `FAMILY_BY_KIND` 加 `debug: 'debug'`；`findEntryByTaskId` 的列表加 `debug_tasks`；**`PHASE_TO_SKILL` 加 debug 表——须按通道分表（§6.1）** |
| `src/core/hooks/task-state-entry.ts`、`draft-create.ts` | 确认 `debug` 归入哪一侧白名单（block-style 分支 / draft 分支） |
| `src/commands/status.ts` | 三处（默认值 / 读取 / 输出）决定是否展示 `debug_tasks` |
| `src/cli/index.ts`、`workflow-entry.ts` 注释 | 4 处 `--kind` 帮助文案补 `debug` |
| `test/ts/` | 新增 debug kind 的初始化、任务列表、phase 解析断言 |

存储段仍用 `.polaris/tasks/<issue_id>/`（与 coding 同目录、不同列表），无需新增目录。

### 6.3 phase 回退（跨技能回流的前提）

现状回流是**技能内**的（失败回上一步）。拆成叶子技能后，`patch → prescribe`、`prove → prescribe`、`diagnose → triage` 必须变成「退出当前技能 → phase 回退 → 重新进入上游技能」。交接协议不支持 phase 回退，拆出来的就是一条**不能回头的单行道**——比不拆更危险。

### 6.4 安装级断言

新增/更新断言：族识别（`debug` 在 `SKILL_FAMILIES`）、policies 注入到每个叶技能、8 个技能落盘路径、通道→阶段技能映射、`prove` 不出现在测试通道装配、`tasks-lint` 正例、归档回读五项（4 文件 + `INDEX.md`）。

## 七、验收标准

批 4/5 完成后可机械核对：

1. 8 个叶技能均可独立安装并出现在预期路径；
2. 每个叶技能的 `policies/` 内含注入的共享样板，且 SKILL.md 内**不含**样板正文；
3. 通道技能 SKILL.md **不含**任何阶段执行细节（正则可查：出现"复现"/"lint"等阶段动词即为失败）；
4. 六段产物路径与 §2 一致（含 `diagnose-brief.md`、`reviews/rca-report.md` 九节齐全）；归档回读 **5 项**（4 文件 + `INDEX.md`）通过；
5. `PHASE_TO_SKILL` 能对两条通道分别解析出正确的下一技能，且 `bugfix` 表里 `patch` 的下一段是 `closeout`（跳过 `prove`）；
6. phase 回退路径可执行（`patch → prescribe`、`prove → prescribe` 各跑通一次）；
7. 现有 `test/ts/commands-install.test.ts`、`test/ts/skills-install.test.ts` 全绿。

## 八、生产通道（已冻结，批 6 落地）

生产通道 = 六个原子全装 + 3 个**人在环节点**。这三处**不建技能**（技能无动作可执行），只出 `templates/` 下的可执行指引：

| 人在环节点 | 位置 | 技能侧产物 | 模板 |
|-----------|------|-----------|------|
| 现场保全执行 | `triage` 段内 | 保全清单：留什么 / 时间窗 / 从哪取 / 为什么 | `triage/templates/preservation-checklist.md` |
| 止血执行（**支路**） | `diagnose` 之后任意时点 | 止血选项卡：手段 / 前提 / 步骤 / 前置校验 / 副作用 / 失败下一步 + 恢复判定口径 | `diagnose/templates/containment-options.md` |
| 发布 / 灰度 / 回滚执行 | `closeout` 之后 | 发布前置检查、回滚触发条件与步骤、灰度阶段与放量比例、观测指标与阈值 | `closeout/templates/release-runbook.md` |

生产通道的加严项（相对测试通道，共 6 项，已落入各阶段技能的 HARD-GATE 与流程）：`triage` 出口改为"时间线·影响面·变更清单三对齐"且复现降为可选；`diagnose` 增加止血支路；`prescribe` 不可折叠且"回退路径可行"为硬门禁；`patch` 增加数据脚本（幂等自审）、埋点、开关；`prove` 为独立阶段（五维，含回滚演练）；`closeout` 增加发布确认。门禁中"人确认 / 人回填"的占比远高于测试通道。

## 九、待决项

无——已全部收敛。此前三项（task kind、`patch`/`prove` 拆分、`closeout` 中文显示名）分别在批 2 前与批 2 后定案：`debug` kind 落地、`patch` + `prove` 拆分、`closeout` 中文显示名定为「关闭Bug」。

## 十、实施批次

| 批 | 内容 | 可回滚点 |
|----|------|---------|
| 1 | 本文档定稿（含待决项收敛） | 文档，无副作用 |
| 2 | 运行机制：§6.1–§6.4 + 第 0 批旧账 | 代码可回退 |
| 3 | policies 下沉（样板抽层，行为不变） | 技能行为不变，可回退 |
| 4 | 拆阶段技能（6 个原子逐段搬运，每段跑断言） | 逐段可回退 |
| 5 | 通道技能 + 入口路由 + 菜单同步 | 可回退 |
| 6 | 生产通道（`templates/` + 加严项 + `prove` 装配启用） | 已完成 |
