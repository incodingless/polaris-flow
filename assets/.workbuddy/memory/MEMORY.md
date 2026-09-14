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

## 二、prototype 族：generate 与 review（两个技能，判据单向流动）

> 2026-09-14 迁移：目录 `zh/skills/prd/prototype*` → `zh/skills/prototype/{generate,review}`，
> 技能全名 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate` / `…review`（nested `polaris:prototype:*`，
> flat `polaris-prototype-*`）。下文路径按新布局写。

- **分工**：`prototype/generate` = 建造（9 阶段 + 6+1 交付物 + `scripts/verify.mjs` + `scripts/scaffold.mjs`）；
  `prototype/review` = 评审（只评不改）。**判据归评审侧**：`prototype/review/references/01-quality-criteria.md`
  是 `§33` 五维+演示就绪 / `§34` 一票否决 31 条 / `§36` 七条一看的**唯一来源**；
  `prototype/generate/references/07` 只留 `# 33 / # 34 / # 36` 编号壳 + 指针；`generate/SKILL.md §八` 只摘最高频 8 条。
  **编号沿用**（33/34/36），约 40 处既有引用一处未改。
- **唯一反向回指 = 执行体**：`scripts/verify.mjs` 留在 generate（脚本不能"按技能名读"）。
  判据文件头与评审 SKILL.md §一 均须写明：跑不了即标「未执行」，不得当通过。
  ⚠️ **review 自己也有一份 `scripts/verify.mjs` 副本**（迁移前就有）——两边不同步就是脚本级双源，待处理。
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
- **方法论/最终判断/能力清单**各只留一份（SKILL.md §一 / ref07 §36 / ref07 §31.1），不得出现第二份。
- **改动页面机制、Token 命名契约或脚本判定后必须重跑 `evals/run.mjs --selftest`**（两侧技能都要）。
- 历史：本技能来自市场技能 `web-hifi-prototype` 的改名副本；本机 `~/.workbuddy/skills/web-hifi-prototype/` 仍在，
  触发词重叠，产品决定**不处理去重、不核实 license**。

## 三、flow 入口（zh/commands/flow.md）

- **询问选项上限 = 10**。唯一来源是 `zh/policies/ask-question-react.md` 的平台询问工具注册表；
  `flow.md`「发问方式」内联表必须与之同步（命令文件安装位置旁无 `policies/`，故内联一份）。
- **需求类菜单**：R01 用户需求(discovery) / R02 产品需求(draft→refine→review→ship) / R03 就绪度(readiness) /
  **R11 由需求文档生成原型(`prototype:generate`)** / **R12 评审已有原型(`prototype:review`）**。（原 R04/R05 编号已废弃。）
  2026-09-14 起两技能迁入 prototype 族，flow.md 的表现不变、目标技能全名已改为 `polaris{{SKN_SPR}}prototype{{SKN_SPR}}*`。
- R11 有意不进「零步：前置需求预检」——复杂度自动路由对原型无意义。
- `en/commands/flow.md` 只有 8 行指针，**从来没有菜单**；改菜单只动 zh。

## 四、未完成 / 待决（2026-09-14 检查后）

对照目标「①独立评审 ②按需求画原型+交付前完成评审」检查结论（详见 `tmp/prototype-goal-check-2026-09-14.md`）：
①已达成；②**未闭合**——建造流没有把评审写成必经门禁。

| ID | 缺口 | 位置 |
|---|---|---|
| G1 | 交付前评审是**可选**不是门禁（阶段 9 只有实现/验收/交接，§十 16 条自检无此项） | `prototype/SKILL.md:55,73,221-239` |
| G2 | 评审输入契约未与建造 6+1 对齐（任务理解卡/黄金流/IA/页面清单在输入表里没出现） | `prototype-review/SKILL.md:47-53` |
| G3 | 评审无「建造移交」话术；Step 0/1 会二次询问（违反不重复询问原则） | `prototype-review/SKILL.md:63-82,185-191` |
| G4 | P0 → 修复 → 重评审 回路在建造侧无落点（只有 README 画了箭头） | `prototype/SKILL.md:73` |
| G5 | flow.md R11 阶段链写「不含评审」、无 →R12 箭头 | `flow.md:366-367` |
| G6 | `requirements-engineering/prd-prototype`：name 不合约定、触发词与 prototype 冲突、内容为旧三阶段英文版 | 待产品定：删 / 缩为指针 / 重命名 |
| G7 | 评审侧无 `example/`（对等物只有评测夹具 report-good.md） | — |
| G8 | 评审 evals 只有 r1/r2，缺「引用 §33/§34 条款号」「命中一票否决必判 P0」「证据不足未混入问题清单」三条断言 | — |

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
