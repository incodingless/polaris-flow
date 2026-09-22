# polaris-flow 项目记忆（2026-09-22 精简重写）

> 精简前全文见同目录 `MEMORY.archive-2026-09-17.md`（含 prototype/debug 细节与历史待决项）。

## 一、仓库约定（skills 层）

- **命名** `name: polaris{{SKN_SPR}}<skills 下路径各段>`，后缀=目录名。先定目录再定 name。安装器用**资产路径**定族/叶，`{{SKN_SPR}}` 只换分隔符。
- `SKILL_FAMILIES`（唯一来源 `src/core/assets/layout.ts`）= `{coding, prd, prototype, testing}`；必须与 `assets/<lang>/skills/` 实际目录同步，漏登记会降级成顶层叶技能。
- 安装器**只认两层** `family/skill`：第三层被当技能内子目录 → policies 注入错位 + 路径必然断链。领域聚合只能提为一级族或改扁平名。
- frontmatter 只用标准 `description`（≤1024）；路由信息只进 description，执行信息只进正文。
- 跨技能相对路径必然断链，只能按技能名引用；`./policies/…`、`./templates/…` 由顶层 `zh/policies/*` 注入，可用。
- `README.md` 不入仓（gitignore + manifest ignoredFiles），改它不随提交/安装走。
- **单源判据**：*改一处是否需要记得改另一处*。反例：给停顿点发短 ID + 索引表被否决（ID 是编码不是语义，且表↔正文构成新双源）→ 只在站点写自解释中文，不加编号/表/章节。
- **停顿点三类**：真决策点写「暂停等用户选」；信息索要写「一次问全」；停止条件写「报告阻塞原因与恢复条件，不得伪造选项」。
- 评测器：每用例须有参照物(应 PASS)+反例(应 FAIL)，`--selftest` 两边跑；参照物不过先修断言，夹具 sha256 要同步。

## 二、prototype 族

- 分工：`blueprint`（需求理解→《原型蓝图》→人工确认即冻结）/ `build`（设计细化+实现+verify）/ `review`（只评不改）/ `ship`（派独立评审→人工确认→归档）。
- 切分判据 `§31.1/§31.2`：页面数量·范围·批次·深度（PM 拍板）归 blueprint；模式/结构/状态/视觉（专业职责）归 build。
- 产物默认 `$REPO_ROOT/.polaris/tasks/$task_id/`，路径写 `state.yaml` 的 `output_dir`。**state.yaml 只记身份与指针，不记进度——产物即状态**。
- 判据唯一来源 `review/references/01-quality-criteria.md`（§33/§34/§36）；`build/references/07` 只留编号壳+指针。
- 等级坐标系两套：E1–E5=取证源，L1–L3=三层验证（静态/冒烟/黄金流）。
- `verify.mjs` 只判「有没有」，全绿≠合格；L2 空白壳按渲染后可见文本长度 `vlen` 判，不要用 `innerText || textContent` 兜底。
- 脚本共享契约（改一处须同步两脚本）：`<section id>`、`data-goto`、`symbol#i-*`+`use href="#i-*"`、`--text-*`、`window.goto()`；注释里出现这些字面量也判 HARD。
- 三层加载：SKILL.md=流程主干；`references/00-basis.md`=**必读**基础（在 references 里却必读，已在文件头/§零/§九三处写明）；01–07 按需查，ref05 约 1030 行按 §九 路由分段读；`references/03` 已废弃（并入 SKILL.md §四 4.3）。
- SKILL.md 统一模板：frontmatter → 标题 → 用途 → 约定 → 启动语 → `## 流程` → Step 0..N → 退出条件 → 中断恢复/上下文压缩恢复 → 尾部（参考文件与工具 + 交付前自检）。
- 改页面机制/Token 契约/脚本判定后须重跑两侧 `evals/run.mjs --selftest`；改任何技能资产后跑 `npx vitest run test/ts/skills-install.test.ts`。

## 三、flow 入口（zh/commands/flow.md）

- 询问选项上限 **10**，唯一来源 `zh/policies/ask-question-react.md`（flow.md 内联一份需同步）。
- 需求菜单：R01 discovery / R02 产品需求 / R03 readiness / R11 制作原型 / R12 评审原型。原型只暴露两入口：R11=`blueprint→build→ship`（build/ship 不占菜单项）；R12=`review`。
- 改菜单要动 6 处：菜单 JSON / 已选功能行 / 零步说明 / 阶段链表 / 需求内容消费表 / 前置依赖表。
- `build` 完成后暂停等确认，不自动推进 ship（口径散在 4 处）。
- 触发语义分层：`blueprint` 吃总目标语义，`build` 吃接续语义；分不开时 blueprint Step 1.5 用 `blueprint.status==confirmed` 分流。

## 四、debug 族

- `diagnose`（场景分流/问题单/复现保全/RCA/方案 tasks.md）→ `patch`（含 1.5 独立验证，仅生产通道）→ `closeout`；`prove` 已并入 patch。
- 入口在命令层 `zh/commands/maintance/{bugfix,hotfix}.md`，技能层无入口技能。`channel` 只影响加严不影响阶段序列 → `DEBUG_PHASE_TO_SKILL` 单表。
- 判据：*若入口只做「预先声明一个下游反正会重判的东西」，它就是多余的*。

## 五、通用教训

- 核验中文用 Grep 工具（ripgrep）；macOS grep 在双引号里不吃 `\|`。
- fs 批量删除被守卫（>50 抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`），脚本清理写 try/catch。
- 技能 md 里**禁止出现以 `..` 开头的路径字面量**（硬阻断安装测试）；讲反模式只能写描述性说法。
- 长会话中用户可能用编辑器改同一文件 → 每轮 Edit 前重新 Read 目标行。
- 「尾部章节没有 Step 指过去 = 死内容」；查法：对每份 references 单独 grep，看命中是否只落在尾部索引表。
- 执行体（脚本命令）必须就近放进调用它的 Step，尾部只留索引类内容。

## 六、待决

- G7 评审侧无 `example/`；G8 评审 evals 缺 3 条断言；G9 同会话自评是否强制换会话待产品定。
- D3：coding / prd / prototype 族未迁移「停顿点三类」写法。
- 拼错的 `./policy/decision-point.md`（`coding/build/SKILL.md:61,85`，少 `ies`）。
- **2026-09-22 新增待决 D1–D5**（上下文边界与压缩时机）：见 `docs/specs/2026-09-22-context-boundary-and-compaction-design.md` §七。核心张力：`auto_transition` 默认 `true`（`assets/shared/templates/state.example.yaml:122`）会自动在同会话衔接下一技能，与「每技能新开会话」冲突。
- `zh/policies/context-recovery.md` 是 **comet 时代死文件**（引用 `node polaris state check` / `./reference/*` / superpowers），**零技能引用**却被注入每个技能的 `./policies/` → 第二份（错的）协议，应删或改为索引。
