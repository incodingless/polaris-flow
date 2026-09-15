# 项目长期记忆 · polaris-flow（2026-09-14 精简重写）

## 一、仓库约定（skills 层）

- **命名**：`name: polaris{{SKN_SPR}}<skills 下目录路径各段>`，后缀必须与目录名一致。**先定目录再定 name**。
  例：`zh/skills/prototype/generate/` → `polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate`。
  安装器用**资产路径**定族/叶，frontmatter 的 `{{SKN_SPR}}` 只替换成分隔符（nested→`:` / flat→`-`），不参与路径推导。
- **技能族清单 `SKILL_FAMILIES`（2026-09-14 起）= `{coding, prd, prototype, testing}`**。
  **唯一来源是 `src/core/assets/layout.ts`**；`src/core/install/skills.ts` 曾有一份重复副本（src 内从未使用、只再导出），
  已改为 `import + export {}` 再导出——**改族清单只需动 layout.ts 一处**。
  ⚠️ 旧记忆里写的 `maintance` **实际并未登记**，且该目录当前为空；登记与否要和 `assets/<lang>/skills/` 实际目录同步，
  漏登记会把该目录降级成「顶层叶技能」。
- **frontmatter**：只用标准 `description`（≤1024 字符）。禁止 `description_zh/en`、`display_name*`。
- **SKILL.md 分层**：**路由信息（触发词、不触发边界）只写 description；执行信息只写正文**。
  正文不放「何时使用」类枚举；执行期纪律（如「不替 PM 决定范围」）不写进 description。
- **安装器只认两层（`family/skill`）**，第三层一律被当作技能内的子目录：
  `layout.ts parseSkillAssetPath` 取 `skill = parts[1]`（`prd/prototype/generate/SKILL.md` → family=prd, skill=prototype,
  underSkill=generate/SKILL.md）。后果有三：**① policies 注入错位**——`skills.ts` 按 `join(skillRoot,'policies')` 注入，
  skillRoot 被算到 `prd/prototype/`，而技能正文的 `./policies/…` 解析到 `prd/prototype/generate/policies/…`，**必然断链**；
  **② `collectSkillLeafRoots` 只收集到 1 个叶**（key=`prd/prototype`），两个子技能被当成同一个；
  **③ 安装器推导名 `polaris:prd:prototype` 丢掉第三层**，与按 `{{SKN_SPR}}` 拼出的四级 name 不一致，
  重现当年 `prd-prototype` 那种「技能 id 与安装目录漂移」。
  → **想做领域聚合，只能把该领域提为一级族并进 `SKILL_FAMILIES`（跨仓改源码），或改用扁平连字符名（`prototype-generate`），不能在族下再套一层。**
  **2026-09-14 已走前一条路**：原型领域提为一级族 `zh/skills/prototype/{generate,review}`，
  `prd` 族因此只剩 7 个技能。回归守卫在 `test/ts/skills-install.test.ts`（nested/flat 安装名 + policies 注入层级）。
- **路径引用**：顶层 `zh/policies/*` 会注入每个叶技能的 `./policies/`，故 `./policies/…`、`./templates/…` 可用；
  **跨技能相对路径（`../xxx/…`）在 flat 布局下必然断裂**——只能按**技能名**引用。
- **README.md 不入仓**：全局 gitignore 忽略所有 `README.md`（`manifest.json` 的 ignoredFiles 同样含它）。
  改 README 不会随提交走；「文档没跟上」可能是没入仓——先 `git check-ignore -v` 再下结论。
- **评测器纪律**：每个用例必须同时有**参照物（应 PASS）**与**反例（应 FAIL）**，`--selftest` 两边都跑；
  **参照物过不去，先修断言，不要改参照物去迁就断言**。
  可复用口径：*等级可以来自所在小节标题（「### P3 待确认」），定位证据必须落在该问题自己的行内*。
  夹具里写了 sha256 时，动夹具必须同步哈希。
- **单源判据**：*改一处是否需要记得改另一处*——需要就是双源，必须指定唯一来源。

## 二、prototype 族：blueprint → build → review（三环节，判据单向流动）

> **2026-09-15 拆为三环节**（原 `generate` 一次跑完需求理解→设计→实现→评审）：
> `prototype/{blueprint,build,review}`。`generate` 目录改名 `build`，`blueprint` 新建。
> 本质：把「判断层 vs 执行层」从技能内分层升级为**技能间分工**，人工确认从软动作变**交付物门禁**。

- **分工**：`blueprint` = 需求理解与思路（Step 3.1–3.4：理解卡/黄金流/IA/页面清单）→《原型蓝图》
  → **人工确认即冻结**；`build` = 设计细化 + 实现（模式/结构/状态/视觉 + scaffold/verify）；
  `review` = 评审（只评不改）。
- **切分点判据** = `§31.1 / §31.2`：页面数量、范围取舍、建设批次、实现深度（§31.2，PM 拍板）归 blueprint；
  页面模式、结构 12 项、状态 11 种、视觉（§31.1，专业职责）归 build。**人工门禁只卡人判断得了
  且有权限判断的事**——否则报告过长、门禁形同虚设。
- **资产**：`verify/scaffold/references 04,05,06,07/evals/assets/example` 归 `build`；`references/02`
  （输入与交接）归 `blueprint`；`00-basis.md` 以 **build 持全量为源**，blueprint 持裁剪版
  （§一 只留两种角色 / §二 按环节改写 / §三 全量）+ 编号壳指针。
- **S1 已闭合**（2026-09-15）：`review/scripts/verify.mjs` 零引用死副本已删，单源自然恢复（正解是删不是加同步守卫）。
- **评审不在 build 内调用**：由 `flow.md` **R13** 驱动；build 退出条件只到 verify 全绿 + 交付物齐备 + 已移交。
  失败回路 R13 → build 修复 → 重跑 4.2 → 重评审。
- **review 的等级编号有两套坐标系**：`E1`–`E5` = **取证源**（E1 需求文档 / E2 经确认的蓝图 / E3 建造侧自述 /
  E4 原型自身+实测 / E5 无需求文档取证法）；`L1`–`L3` = **三层验证**（静态/冒烟/黄金流），报告模板与 evals 用后者。
  **E2 是三环节拆分新增的一级**——把「是否符合已确认设计」从被评审者自述升为需求方已背书的事实，但仍顶替不了 E1。
- **产物落盘**：默认 `$REPO_ROOT/.polaris/tasks/$task_id/`，路径写 `state.yaml` 的 `output_dir`。
  **状态源已定**：`state.yaml` 只记身份与指针（task_id/phase/naming/output_dir），
  **不记做到第几步**——进度一律以落盘产物为准（产物即状态），消解了 9-14 发现的双源冲突。
- **工作流参数**：`--kind requirement --skill <技能名>`（`--kind` 合法值仅 `change|requirement|testcase`，
  写 `prototype` 会直接报错；`--skill` 按 `workflow-entry.ts:270` 只是**锁文件写者标识**，
  任务按 kind 分组、phase 过滤——取技能名还是族名都不影响任务查找，按 discovery/draft 惯例取技能名）。
- **判据仍归评审侧**：`prototype/review/references/01-quality-criteria.md` 是 `§33` 五维+演示就绪 /
  `§34` 一票否决 31 条 / `§36` 七条一看的**唯一来源**；`build/references/07` 只留 `# 33 / # 34 / # 36`
  编号壳 + 指针；`build/references/00-basis.md §八` 只摘最高频 8 条。编号沿用（33/34/36）。
- **唯一反向回指 = 执行体**：`scripts/verify.mjs` 留在 build（脚本不能"按技能名读"）。
  判据文件头与评审 SKILL.md §一 均须写明：跑不了即标「未执行」，不得当通过。
  ⚠️ **review 自己也有一份 `scripts/verify.mjs` 副本**（迁移前就有）——**零引用死副本，正解是删除**（S1）。
- **分级与判据分离**：判据回答「是不是问题」，P0–P3 回答「多重」——后者只在评审 SKILL.md §四，两边不得互替。
- **脚本共享契约**（改任一处须同步改两个脚本，否则「脚本全绿但规范已变」）：
  `<section id>` 页面容器、`data-goto`、`symbol#i-*` + `use href="#i-*"`、`--text-*` Token、`window.goto()`。
  陷阱：注释里出现 `<use href="#i-xxx"/>`、`goto('xxx')` 字面量会被 verify 判 HARD（注释同样被扫描）。
- **verify 只判「有没有」不判「好不好」**；全绿 ≠ 合格。L2 空白壳判定以**渲染后可见文本长度**为准，
  取 `vlen` 不可用 `innerText || textContent` 兜底（可见为空时回落会把隐藏内容算成可见）。
- **Token 对比度**：`--text-placeholder` = `#646b85`（5.27:1）；阈值 4.5:1。
  实测：`#8f94ad` 3.00 ❌ / `#666666` 5.74 ✅ / `#333333` 12.63 ✅。
- **ref05 按需加载**：约 1030 行，只按 SKILL.md §九 路由表分段读（§16.1 命名属阶段 3；§15.5+§16.2–16.3 密度/容器属阶段 6；
  §17–21 组件阶段 9 按需）。ref05 头部只有章节地图，**时机只在 SKILL.md §九 定义**。
- **方法论/角色/最终判断/能力清单**各只留一份：**SKILL.md §一**（角色五种 + 一句话方法论，
  `references/01` 已变编号壳）/ 评审侧 criteria `§36`（最终判断）/ **SKILL.md §二（`§31` 能力与决策边界，
  2026-09-14 上移至此，ref07 §31 只留编号壳）**，不得出现第二份。
- **上移 vs 下沉的判据（2026-09-14 定型，可复用）**：*重复归谁，看加载语义不看篇幅*——
  必加载区（SKILL.md）收「开工即必须知道」的执行心智；references 只放「用到才查」的展开。
  上移手法统一为：**内容进 SKILL.md + 原处留编号壳 + 指针 + 编号沿用**（ref07 §31/§33/§34/§36、ref01 §2/§3 同法）。
  `ref01` 现仅 10 行；改前原文在 `tmp/backup/prototype-family-migration-20260914/`。
- **能不能外置到不参与加载的文档（2026-09-14 定型，与上条同族）**：*看它是不是"执行时必须被模型读到"*——
  是则必须留在加载路径（SKILL.md 流程主干 / `00-basis.md` 开工必读区）；只有不是，才外置。
  实践：4.1「两层结构」拆成**设计理由 → `PROVENANCE.md「设计思路」`节**（不参与加载，纯元信息）+
  **执行规则 → SKILL.md 4.1**（回填后复检下游产出物并留说明、前置假设不设需求复核回路）。
  ⚠️ 提 README.md 当外置位置时先否掉：它**不入仓也不随技能安装**（全局 gitignore + manifest ignoredFiles
  + 安装器过滤），写进去=只在本机可见，模型执行时读不到。
- **SKILL.md 书写形式（2026-09-14 用户手工定稿，全仓统一模板）**：`frontmatter` → `# 标题` → 用途一行 →
  约定章节（命名/标识）→ `**启动时必须先输出**：[polaris-flow X] … 使用 <技能名> 技能。` → **`## 流程`** →
  `### Step 0 设置产物语言` / `Step 1 状态检查及中断恢复`（`$PLUGIN_ROOT` `$REPO_ROOT`、`workflow-entry.sh`、
  `get-active-changes`、`task_id`、`state.yaml`、`./policies/decision-point.md` A/B/C/D、H12 阻断）→
  `Step 2 初始化`（命名 + `read_file ./references/00-basis.md`）→ `Step 3…N 业务步骤`（每步带产出物/
  判据/bash 命令/分支表）→ 退出条件 → 中断恢复 / 上下文压缩恢复 → 尾部附录（参考文件路由 + 脚本 + 自检）。
  **SKILL.md 只做流程编排，常量全部外置到 `references/00-basis.md`**，不在正文展开。
  对照样本：`prd/discovery`、`prd/draft`、`coding/*`；`prototype/generate` 已由用户手工改成此形。
- **workflow-entry.sh 参数契约（2026-09-14 查实）**：脚本本身是 10 行薄包装，业务在 `src/core/hooks/workflow-entry.ts`。
  **`--kind` 只有 `change|requirement|testcase` 三个合法值**（缺/非法即报错）；**`--skill` 是自由字符串、无白名单**
  （现有取值 discovery/draft/plan/design/build/specify/tasks/verify/tweak/normal/refine/ship）。
  ⇒ 原型类任务写 `--kind requirement` + `--skill prototype`（族级，generate/review 共享同一 task 条目）。
- **三层加载语义（2026-09-14 定型）**：`SKILL.md` = 流程主干（**§四 9 阶段 / §九 资源与脚本路由 /
  §十 自检 16 条**）· **`references/00-basis.md` = 必读基础**（§一 角色与方法论 / §二 能力·决策边界 /
  §三 核心原则与冻结规则 / §五 AI 专项 / §六 视觉红线 / §七 研发交付 / §八 一票否决 8 条 / §十一 最终判断标准）·
  `references/01–07` = 按需查某段。**编号沿用拆分前的全文编号，两边都不重排**（§零 是新增的开工必读）。
  ⚠️ `00-basis.md` 在 `references/` 目录里却是**必读**——目录语义因此不单一，
  已在文件头 / `§零` / `§九` 三处写明区别，别把它当按需文件。
  **代价**：必读内容靠指令加载是**软约束**，漏读即丢红线——缓解靠 §零 强措辞 + SKILL.md 顶部
  「三条不可协商的红线」指针（只指针不内容）+ 过程内引用写全 `references/00-basis.md §X`。
  generate 现 **323 行** / version 2.1.0；回滚备份 `tmp/backup/SKILL.md.before-basis-split.md`。
- **`references/03` 已废弃（2026-09-14）**：内容并入 `SKILL.md §四 4.3`——**阶段 1–5 的完整做法
  （理解卡 10 项 / 转换公式示例 / Gate 1 / 黄金流五原则 / IA 七原则 + 推荐结构 / 页面必要性 6 条 /
  职责拆分合并判据 / 页面清单 9 项 / 九种模式 9 行表）现在只有 4.3 一处**，阶段 6–8 仍指 ref04 / ref05。
  `03` 是空号不再复用，`04`–`07` 沿用原号；ref03 的「第 6—10 章」编号未迁移（4.3 用「阶段 N」寻址）。
  `references/` 现有：00 必读 · 01 壳 · 02 · 04 · 05 · 06 · 07。
- **改动页面机制、Token 命名契约或脚本判定后必须重跑 `evals/run.mjs --selftest`**（两侧技能都要）。
- 历史：本技能来自市场技能 `web-hifi-prototype` 的改名副本；本机 `~/.workbuddy/skills/web-hifi-prototype/` 仍在，
  触发词重叠，产品决定**不处理去重、不核实 license**。

## 三、flow 入口（zh/commands/flow.md）

- **询问选项上限 = 10**。唯一来源是 `zh/policies/ask-question-react.md` 的平台询问工具注册表；
  `flow.md`「发问方式」内联表必须与之同步（命令文件安装位置旁无 `policies/`，故内联一份）。
- **需求类菜单（2026-09-15 起 6 项）**：R01 用户需求(discovery) / R02 产品需求 / R03 就绪度(readiness) /
  **R11 生成原型制作思路(`prototype:blueprint`)** / **R12 按蓝图制作原型(`prototype:build`)** /
  **R13 评审已有原型(`prototype:review`)**。（原 R04/R05 编号已废弃；旧 R11=制作 / R12=评审已顺延。）
- R12 的前置是「R11 蓝图已确认」——**缺失阻断**，制作环节不自行补设计结论。
- R11 有意不进「零步：前置需求预检」——复杂度自动路由对原型无意义。
- `en/commands/flow.md` 只有 8 行指针，**从来没有菜单**；改菜单只动 zh。

## 四、未完成 / 待决（2026-09-14 晚评审后更新）

对照目标「①独立评审 ②按需求画原型+交付前完成评审」：**两条均已达成**。
G1–G6 已在第十四～十八轮陆续闭合，2026-09-14 晚评审时逐一在文件层面验证过：
G1（9.3 硬门禁+退出条件#3）、G2（评审输入表第6行建造移交包+取证源分级 L1–L4）、
G3（入口 B 不等待不重复询问）、G4（9.3 结论分支表「不得交付→修复→重跑 9.2→重评审」）、
G5（flow.md R11 阶段链含 9.3 评审→调用 R12）、G6（prd-prototype 留壳指针+旧族废弃决策）。

**仍开放（2026-09-14 晚技能评审新增 S 系编号）：**

| ID | 缺口 | 严重度 |
|---|---|---|
| S1 | `review/scripts/verify.mjs` 是**零引用死副本**（review 全部文档口径指向 generate 的脚本；evals 从不执行它）——**正解是删除而非加同步守卫**（2026-09-14 晚查实，待执行）。generate 侧必须保留：9.2 门禁、迭代回路、P0 回路、generate evals 自证体系四条硬依赖 | 高 |
| G7 | 评审侧无 `example/`（对等物只有评测夹具 report-good.md） | 低 |
| G8 | 评审 evals 只有 r1/r2，缺「引用 §33/§34 条款号」「命中一票否决必判 P0」「证据不足未混入问题清单」三条断言 | 低 |
| G9 | 9.3 同会话自评独立性——已要求如实标注，是否强制换会话待产品定 | 待产品 |
| — | evals selftest 反例输出可读性：`✗ FAIL e3` / `退出码 1，期望 0` 易误读为 selftest 挂了（实际退出码 0 自证通过），建议反例块加「（反例·此失败是预期）」标注 | 低 |
| — | ref07 §27.1 只写了 Windows 的 msedge 无 Playwright 路径，macOS/Linux 口径未进规范文档（脚本本身支持，macOS 实测通过） | 低 |

其他非阻塞：无 CI 兜底；`verify` 自身缺 `--selftest`；ref05 体积；一票否决 31 条三分未做；
早期四类缺陷夹具未入库；`references/02` 是否把「设计系统」列为需求包输入项待产品定。

## 五、通用手法与工具教训

- **HTML 原型验证免装 Playwright**：系统 Chrome/Edge + `--headless=new --dump-dom --virtual-time-budget=4000 --window-size=W,H`，
  探针注入原型**同目录副本**（相对资源可解析），结果写进带 id 的渲染锚点（`<pre id="__pvResult">`）后按元素提取——
  全文正则会命中探针自身源码。错误采集器必须**早于作者脚本**注入。
- **核验中文内容不要用 macOS grep**：BSD grep 在双引号里不吃 `\|` 交替（静默返回空），中文多字节模式也不可靠。
  一律用 Grep 工具（ripgrep）或 `grep -E 'a|b'`。
- **本机 fs 删除被守卫**：`node-safe-delete-shim.cjs` 统计每轮 turn 删除数，>50 直接抛错
  （`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。脚本侧清理一律写 `try/catch`。
- **改含 template literal 的脚本时，注释里别用反引号包标识符**：会截断模板字符串，报错位置误导。
- **冷启动试用不能省**：断言太松会被反例戳穿，太紧不会——只有换一个真实产物跑才会暴露。
  （`test-project`《工单派发 V1.1》已按 9 阶段一次成型跑通，HARD 0 / WARN 0。）
- **技能级 evals 覆盖不到安装级约束**：改任何技能资产后，必须在仓库根跑 `npx vitest run test/ts/skills-install.test.ts`。
  该测试会因「技能 md 里出现以 `..` 开头的路径字面量」**硬阻断安装**——哪怕那是当反面例子写的。
  2026-09-14 就在 `PROVENANCE.md` 撞了一次：举例描述被禁写法，反被判违规，整个安装不可用。
  **文档里要讲反模式，只能写描述性说法，不能写治理字面量。**
- `⇒ npx vitest run` 全量还有 8 文件 / 6 用例失败（openspec / superpowers / file-system / cli / agents-install /
  session-start-sh / command-adapters / workflow），**2026-09-14 已用「临时 git checkout 源码跑同一子集」确认是既有失败**，
  不是本次改动引入。判断「红是不是我造成的」一律这么做，别靠猜。
