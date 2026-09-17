# 项目长期记忆 · polaris-flow（2026-09-17 精简重写）

## 一、仓库约定（skills 层）

- **命名**：`name: polaris{{SKN_SPR}}<skills 下目录路径各段>`，后缀必须与目录名一致。**先定目录再定 name**。
  安装器用**资产路径**定族/叶；frontmatter 的 `{{SKN_SPR}}` 只替换成分隔符（nested→`:` / flat→`-`），不参与路径推导。
- **技能族清单 `SKILL_FAMILIES` = `{coding, prd, prototype, testing}`**，唯一来源 `src/core/assets/layout.ts`
  （`src/core/install/skills.ts` 已改为再导出）。⚠️ `maintance` 未登记且目录为空；登记必须与
  `assets/<lang>/skills/` 实际目录同步，漏登记会把该目录降级成「顶层叶技能」。
- **frontmatter**：只用标准 `description`（≤1024 字符）。禁止 `description_zh/en`、`display_name*`。
- **SKILL.md 分层**：路由信息（触发词、不触发边界）只写 description；执行信息只写正文。执行期纪律不写进 description。
- **安装器只认两层（`family/skill`）**，第三层被当作技能内子目录（`parseSkillAssetPath` 取 `skill = parts[1]`）。后果：
  ① policies 注入错位、正文的 `./policies/…` 必然断链；② `collectSkillLeafRoots` 把多个子技能收成 1 个叶；
  ③ 推导名丢掉第三层，与按 `{{SKN_SPR}}` 拼出的名字漂移。
  → **领域聚合只能把该领域提为一级族（改 `SKILL_FAMILIES`），或改用扁平名（`prototype-generate`），不能在族下再套一层。**
  已按前者落地：`zh/skills/prototype/{build, review}`，prd 族因此剩 7 个技能。守卫在 `test/ts/skills-install.test.ts`。
- **路径引用**：顶层 `zh/policies/*` 注入每个叶技能的 `./policies/`，故 `./policies/…`、`./templates/…` 可用；
  **跨技能相对路径（`../xxx/…`）必然断链**，只能按技能名引用。
- **README.md 不入仓**（全局 gitignore + manifest ignoredFiles）：改它不随提交走，也不随技能安装（模型执行时读不到）。
  「文档没跟上」先 `git check-ignore -v` 再下结论。
- **评测器纪律**：每个用例必须同时有参照物（应 PASS）与反例（应 FAIL），`--selftest` 两边都跑；
  **参照物过不去先修断言，不要改参照物迁就断言**。夹具写了 sha256 时，动夹具必须同步哈希。
- **单源判据**：*改一处是否需要记得改另一处*——需要就是双源，必须指定唯一来源。

## 二、prototype 族：blueprint → build → review（+ ship）

- **分工**：`blueprint` = 需求理解与思路（Step 3.1–3.4：理解卡/黄金流/IA/页面清单）→《原型蓝图》→**人工确认即冻结**；
  `build` = 设计细化 + 实现（模式/结构/状态/视觉 + scaffold/verify）；`review` = 评审（只评不改）；
  `ship` = 派发独立评审 → 人工确认 → 归档 → 收尾。本质：把「判断层 vs 执行层」从技能内分层升级为**技能间分工**，
  人工确认从软动作变**交付物门禁**。
- **切分点判据 = `§31.1 / §31.2`**：页面数量、范围取舍、建设批次、实现深度（§31.2，PM 拍板）归 blueprint；
  页面模式、结构 12 项、状态 11 种、视觉（§31.1，专业职责）归 build。**人工门禁只卡人判断得了且有权限判断的事**。
- **资产**：`verify/scaffold/references 04–07/evals/assets/example` 归 build；`references/02` 归 blueprint；
  `00-basis.md` 以 **build 持全量为源**，blueprint 持裁剪版 + 编号壳指针。
- **评审不在 build 内调用**，由 `flow.md` **R13** 驱动；build 退出条件只到 verify 全绿 + 交付物齐备 + 已移交；
  失败回路 R13 → build 修复 → 重跑 4.2 → 重评审。
- **ship 存在的首要理由是独立性**：ship 用 `subagent-probe → 选 agent → subagent-dispatch` 派发，评审跑在独立上下文，
  「同会话自评独立性受限」的限制不成立；平台不支持 subagent 时降级 inline 并标注「本轮未独立执行」，**判据不放宽**。
- **review 有两套等级坐标系**：`E1`–`E5` = **取证源**（E1 需求文档 / E2 经确认的蓝图 / E3 建造侧自述 /
  E4 原型自身+实测 / E5 无需求文档取证法）；`L1`–`L3` = **三层验证**（静态/冒烟/黄金流），报告模板与 evals 用后者。
  E2 是三环节拆分新增的一级——把「是否符合已确认设计」升为需求方已背书的事实，但仍顶替不了 E1。
- **产物落盘**：默认 `$REPO_ROOT/.polaris/tasks/$task_id/`，路径写 `state.yaml` 的 `output_dir`。
  **状态源已定**：`state.yaml` 只记身份与指针（task_id/phase/naming/output_dir），**不记做到第几步**——
  进度一律以落盘产物为准（产物即状态）。
- **工作流参数**：`--kind requirement --skill <技能名>`（`--kind` 合法值仅 `change|requirement|testcase`，
  写 `prototype` 会报错；`--skill` 按 `workflow-entry.ts:270` 只是**锁文件写者标识**，取技能名或族名不影响任务查找）。
- **判据归评审侧**：`prototype/review/references/01-quality-criteria.md` 是 `§33` 五维+演示就绪 / `§34` 一票否决 31 条 /
  `§36` 七条一看的**唯一来源**；`build/references/07` 只留编号壳 + 指针；`build/references/00-basis.md §八` 只摘最高频 8 条。
- **分级与判据分离**：判据回答「是不是问题」，P0–P3 回答「多重」——后者只在评审 SKILL.md §四，两边不得互替。
- **唯一反向回指 = 执行体**：`scripts/verify.mjs` 留在 build（脚本不能"按技能名读"）；review 侧零引用死副本已删
  （正解是删不是加同步守卫）。判据文件头与评审 SKILL.md §一 均须写明：跑不了即标「未执行」，不得当通过。
- **脚本共享契约**（改任一处须同步两个脚本，否则「脚本全绿但规范已变」）：`<section id>` 页面容器、`data-goto`、
  `symbol#i-*` + `use href="#i-*"`、`--text-*` Token、`window.goto()`。
  陷阱：注释里出现 `<use href="#i-xxx"/>`、`goto('xxx')` 字面量也会被 verify 判 HARD（注释同样被扫描）。
- **verify 只判「有没有」不判「好不好」**；全绿 ≠ 合格。L2 空白壳判定以**渲染后可见文本长度**为准，
  取 `vlen`，不可用 `innerText || textContent` 兜底（可见为空时回落会把隐藏内容算成可见）。
- **Token 对比度**：`--text-placeholder` = `#646b85`（5.27:1）；阈值 4.5:1。
  实测：`#8f94ad` 3.00 ❌ / `#666666` 5.74 ✅ / `#333333` 12.63 ✅。
- **ref05 按需加载**（约 1030 行）：只按 SKILL.md §九 路由表分段读。ref05 头部只有章节地图，
  **加载时机只在 SKILL.md §九 定义**。
- **三层加载语义**：`SKILL.md` = 流程主干（§四 9 阶段 / §九 资源与脚本路由 / §十 自检）·
  **`references/00-basis.md` = 必读基础**（§一 角色与方法论 / §二 能力·决策边界 / §三 核心原则与冻结 /
  §五 AI 专项 / §六 视觉红线 / §七 研发交付 / §八 一票否决 8 条 / §十一 最终判断标准）· `references/01–07` = 按需查。
  编号沿用拆分前的全文编号，两边都不重排。⚠️ `00-basis.md` 在 `references/` 里却是**必读**——目录语义不单一，
  已在文件头 / §零 / §九 三处写明。**代价**：必读靠指令加载是软约束，漏读即丢红线——
  缓解靠 §零 强措辞 + SKILL.md 顶部「三条不可协商的红线」指针（只指针不内容）+ 过程内引用写全 `references/00-basis.md §X`。
- **`references/03` 已废弃**：内容并入 `SKILL.md §四 4.3`（阶段 1–5 的完整做法现在只有 4.3 一处），
  `03` 为空号不再复用，`04`–`07` 沿用原号（阶段 6–8 仍指 ref04/ref05）。
- **方法论/角色/最终判断/能力清单各只留一份**：SKILL.md §一（角色 + 一句话方法论，ref01 已变 10 行编号壳）/
  评审侧 criteria `§36` / SKILL.md §二（`§31` 能力与决策边界已上移，ref07 §31 只留壳）。不得出现第二份。
- **上移 vs 下沉的判据**：*重复归谁，看加载语义不看篇幅*——必加载区（SKILL.md）收「开工即必须知道」的执行心智，
  references 只放「用到才查」的展开。手法统一为：**内容进 SKILL.md + 原处留编号壳 + 指针 + 编号沿用**。
- **能不能外置到不参与加载的文档**（与上条同族）：*看它是不是"执行时必须被模型读到"*——是则必须留在加载路径
  （SKILL.md 流程主干 / `00-basis.md` 开工必读区）。实践：「两层结构」的设计理由 → `PROVENANCE.md`，执行规则 → SKILL.md 4.1。
- **SKILL.md 书写形式（用户手工定稿，全仓统一模板）**：`frontmatter` → `# 标题` → 用途一行 → 约定章节（命名/标识）→
  `**启动时必须先输出**：[polaris-flow X] … 使用 <技能名> 技能。` → **`## 流程`** →
  `### Step 0 设置产物语言` / `Step 1 状态检查及中断恢复`（`$PLUGIN_ROOT` `$REPO_ROOT`、`workflow-entry.sh`、
  `get-active-changes`、`task_id`、`state.yaml`、`./policies/decision-point.md` A/B/C/D、H12 阻断）→
  `Step 2 初始化`（命名 + `read_file ./references/00-basis.md`）→ `Step 3…N 业务步骤`（每步带产出物/判据/bash 命令/分支表）
  → 退出条件 → 中断恢复 / 上下文压缩恢复 → 尾部附录（参考文件路由 + 脚本 + 自检）。
  **SKILL.md 只做流程编排，常量全部外置到 `references/00-basis.md`**。对照样本：`prd/discovery`、`prd/draft`、`coding/*`。
- **改动页面机制、Token 命名契约或脚本判定后必须重跑 `evals/run.mjs --selftest`**（两侧技能都要）。
- 历史：本技能来自市场技能 `web-hifi-prototype` 的改名副本；本机 `~/.workbuddy/skills/web-hifi-prototype/` 仍在，
  触发词重叠，产品决定**不处理去重、不核实 license**。

## 三、flow 入口（zh/commands/flow.md）

- **询问选项上限 = 10**。唯一来源是 `zh/policies/ask-question-react.md` 的平台询问工具注册表；
  `flow.md`「发问方式」内联表必须与之同步（命令文件安装位置旁无 `policies/`，故内联一份）。
- **需求类菜单（5 项）**：R01 用户需求(discovery) / R02 产品需求 / R03 就绪度(readiness) / R11 制作原型 / R12 评审已有原型。
- **原型只暴露两个菜单入口**：R11 = `blueprint` → `build` → `ship` 全链（build / ship **不占菜单项**）；
  R12 = `review` 单独评审（只评不改、**不归档**）。改菜单要动 6 处：菜单 JSON / `已选功能` 行 / 零步说明 /
  阶段链表 / 需求内容消费表 / 前置依赖表。
- **触发语义分层**：`blueprint` 吃**总目标语义**（做个原型 / 从需求到原型交付 / 这个需求要做哪些页面），
  `build` 吃**接续语义**（照蓝图做 / 继续做 / 重做某几个页面 / **修改已有原型**）。
  **触发词分不开的意图交给状态分**：blueprint Step 1.5 有「`blueprint.status == confirmed` → 引导到 build」分支。
- **build 完成后暂停等确认**：不自动推进 ship，呈现「已完成 + 可交付」后由用户决定，避免原型没被看就归档。
  同一口径散在 build 的 4 处（Step 5 正文 / Step 1.5 进度表 / 推荐顺序 / 退出条件#5），改一处不算完。
- **改已有原型归 build**，且无蓝图时**不阻断**（build Step 2.1 门禁表有专用分支：限于用户指定点最小改动，
  走 scaffold 定点插入，不整份重写）。**归口一个语义时必须同时检查入口门禁能不能过**。
- R11 有意不进「零步：前置需求预检」——复杂度自动路由对原型无意义。
- `en/commands/flow.md` 只有 8 行指针，**从来没有菜单**；改菜单只动 zh。

## 四、未完成 / 待决

**已闭合**：G1–G6（硬门禁 / 评审输入表 / 入口 B 不重复询问 / 结论分支表 / R11 阶段链 / 留壳指针）、
S1（review 侧死副本 verify.mjs 已删）。对照目标「①独立评审 ②按需求画原型+交付前完成评审」均已达成。

| ID | 缺口 | 严重度 |
|---|---|---|
| G7 | 评审侧无 `example/`（对等物只有评测夹具 report-good.md） | 低 |
| G8 | 评审 evals 只有 r1/r2，缺「引用 §33/§34 条款号」「命中一票否决必判 P0」「证据不足未混入问题清单」三条断言 | 低 |
| G9 | 评审同会话自评独立性——已要求如实标注，是否强制换会话待产品定 | 待产品 |
| D1 | **debug 族「按 `./policies/decision-point.md` 暂停/询问」引用过密（diagnose 15 处、全仓 ~60 处），
  写法有 5 种（全路径 / 裸名 / 「决策点协议」/ 半截 `decision-point：`）；且约半数场景（索要 Jira 单号、
  信息补齐、止血状态申报）不是决策点，属误用。** 2026-09-17 提出，方案：给决策点发短 ID（对齐 H 系列范式）+
  区分「决策点（DP）」与「信息索要（ASK）」两类标记 + 必须跨会话恢复的决策点落 state 字段。待用户拍板 | 中 |

其他非阻塞：无 CI 兜底；`verify` 自身缺 `--selftest`；ref05 体积；一票否决 31 条三分未做；早期四类缺陷夹具未入库；
`references/02` 是否把「设计系统」列为需求包输入项待产品定；evals 反例块建议加「（反例·此失败是预期）」标注；
ref07 §27.1 只写了 Windows 的 msedge 无 Playwright 路径，macOS/Linux 口径未进规范文档（脚本本身支持，macOS 实测通过）。

## 五、通用手法与工具教训

- **HTML 原型验证免装 Playwright**：系统 Chrome/Edge + `--headless=new --dump-dom --virtual-time-budget=4000
  --window-size=W,H`；探针注入原型**同目录副本**（相对资源可解析），结果写进带 id 的渲染锚点后按元素提取——
  全文正则会命中探针自身源码；错误采集器必须**早于作者脚本**注入。
- **核验中文内容不要用 macOS grep**：BSD grep 双引号里不吃 `\|` 交替（静默返回空），中文多字节模式也不可靠。
  一律用 Grep 工具（ripgrep）或 `grep -E 'a|b'`。
- **本机 fs 删除被守卫**：`node-safe-delete-shim.cjs` 统计每轮删除数，>50 直接抛错
  （`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。脚本侧清理一律写 `try/catch`。
- **改含 template literal 的脚本时，注释里别用反引号包标识符**：会截断模板字符串，报错位置误导。
- **技能级 evals 覆盖不到安装级约束**：改任何技能资产后必须在仓库根跑 `npx vitest run test/ts/skills-install.test.ts`。
  该测试会因「技能 md 里出现以 `..` 开头的路径字面量」**硬阻断安装**——哪怕那是当反面例子写的。
  **文档里要讲反模式，只能写描述性说法，不能写治理字面量。**
- **判断「红是不是我造成的」**：用「临时 git checkout 源码跑同一子集」确认，别靠猜。
  2026-09-14 全量 `npx vitest run` 有 8 文件 / 6 用例失败（openspec / superpowers / file-system / cli /
  agents-install / session-start-sh / command-adapters / workflow），已确认是既有失败。
- **SKILL.md 尾部章节统一叫「参考文件与工具」/「交付前自检」**，不叫「附录 A/B」；改章节名必须同步 ref00 / ref05 / 跨技能引用。
- **执行体（脚本命令）必须就近放进调用它的 Step**：放尾部 = 模型执行到关键一步要跳读 40 行，且必然与自检清单重复成双源。
  尾部只留「索引类」内容（读哪份文档 / 什么时候读 / 样例与评测）——**可以瘦身，但不能清空**。
- **尾部章节没有 Step 指过去 = 死内容**：脚本命令放附录、Step 够不着；「交付前自检」挂文末、build 零引用。
  **改完 Step 后要反问：文末还剩什么？谁会读它？** 同族变体：**「要读的规范」没有触发点 = 没人读**，
  且**被尾部索引表兜住时完全看不出来**（表在，看起来"被引用了"，实际没有 Step 会打开它）。
  **查法**：对每份 references 单独 grep，看命中是否只落在尾部索引表里。
  **修法**：调用点补进对应 Step（指到章节号，不指整份文件），表的「何时读」列改成 Step 号与 Step 互指。
- **改技能后按「同一个 bug 的副本」扫一遍**：`Step x.y` 这类指针常在 3–4 个文件里各写一份。
  **拼写类 bug 也要当真 bug 看**：`buleprint` 让提示里的技能名指向不存在的技能，且 `state.yaml` 字段对不上，门禁永远过不了。
- **长会话里用户可能自己用编辑器改同一个文件**：**每轮 Edit 前重新 Read 目标行**，别拿上一轮 grep 的快照当 old_string——
  Edit 报"字符串不存在"就是信号，先看 mtime 与当前内容。
- **多行 old_string 替换要数清行数**：**new 的行集合必须逐一对应 old 的每一行**，否则整行被吞。
- **冷启动试用不能省**：断言太松会被反例戳穿，太紧不会——只有换一个真实产物跑才会暴露。
