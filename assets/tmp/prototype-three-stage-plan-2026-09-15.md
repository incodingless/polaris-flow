# 原型三环节拆分落地方案

**日期**：2026-09-15　**状态**：待用户确认后执行

## 一、目标结构

```
assets/zh/skills/prototype/
├── blueprint/   环节 1 需求理解 → 《原型蓝图》→ 人工确认冻结   【新建】
├── build/       环节 2 原型制作 → 高保真 HTML 原型             【由 generate 改名】
└── review/      环节 3 原型评审 → 《评审报告》                  【保留 + 小改】
```

技能全名：`polaris{{SKN_SPR}}prototype{{SKN_SPR}}blueprint` / `…build` / `…review`

**源码不用改**：`SKILL_FAMILIES`（`src/core/assets/layout.ts:23`）已含 `prototype`；
仅需同步该文件第 19 行的注释（现写"其下为 generate / review"）。

## 二、三个技能的职责边界

判据沿用既有 `references/00-basis.md §31.1 / §31.2`：

| 环节 | 负责 | 准出 | 门禁 |
|---|---|---|---|
| blueprint | `§31.2` 中由产品经理拍板的部分：方向、范围、页面划分与职责 | 《原型蓝图》+ `task-card.md` / `golden-flow.md` / `ia.md` / `page-list.md` | **人工确认 → 冻结** |
| build | `§31.1` 中本技能的专业职责：页面模式、结构、状态、视觉 + 实现 | 原型 `.html` + `flow.json` + `page-structure.md` + `handoff.md` | `verify` 退出码 0 |
| review | 只评不改 | 《评审报告》+ P0–P3 清单 | P0 清零 |

**为什么切在页面清单之后**：页面数量、范围取舍、建设批次属 `§31.2`（PM 决策）；
页面模式、结构、状态、视觉属 `§31.1`（技能职责）。人工门禁只卡人判断得了且有权限判断的事。

## 三、Step 骨架

### blueprint（沿用全仓 Step 模板）

```
Step 0 设置产物语言
Step 1 状态检查及中断恢复   --kind requirement --skill prototype，phase=blueprint
Step 2 初始化               2.1 命名（原型名 + Page ID 前缀） / 2.2 加载必读
Step 3 需求理解与思路形成
       3.1 理解需求 + 产品快速定义（任务理解卡）
       3.2 黄金任务流
       3.3 信息架构 IA
       3.4 页面体系与职责划分（页面清单）
Step 4 人工确认 → 冻结（准出）
退出条件 / 参考文件与工具
```

Step 4 采用 `prd/discovery` 7.7 的确认判定表：仅对某条反馈、模糊回复、沉默**均不算确认**，须再问一次。

### build

```
Step 0 设置产物语言
Step 1 状态检查及中断恢复   phase=build；前置校验蓝图产物已存在且已确认
Step 2 初始化               2.1 加载蓝图产物 / 2.2 加载必读
Step 3 设计细化             3.1 页面模式 / 3.2 页面结构 12 项 / 3.3 状态 11 种 / 3.4 视觉系统
Step 4 实现                 scaffold init → 逐页填主体 → 落 flow.json
Step 5 验证                 verify 全三层，退出码分支表
Step 6 交付                 研发交接说明 + 需求追踪
退出条件 / 参考文件与工具
```

**删除**现有 generate 内部的"Step 5 评审"调用——评审改由流程驱动（R13），不再由 build 内部发起。

## 四、资产归属

| 资产 | 现在 | 将来 |
|---|---|---|
| `references/00-basis.md` | generate 全量 128 行 | **build 持全量（源）**；blueprint 持裁剪版（`§一` 角色 / `§二` 边界 / `§三` 原则与冻结），其余章节用编号壳 + 按技能名指针 |
| `references/01-methodology-roles.md` | generate（10 行编号壳） | 随 build 保留，或连同空号一并废弃（待定） |
| `references/02-inputs-handoff.md` | generate | **blueprint**（最低输入 6 项、不重复询问、承接方案转换） |
| `references/04-page-interaction-ai.md` | generate | **build** |
| `references/05-visual-system-components.md` | generate | **build** |
| `references/06-responsive-accessibility.md` | generate | **build** |
| `references/07-delivery-quality-review.md` | generate | **build**（交付前自检）；review 侧按技能名引用，不复制 |
| `scripts/verify.mjs` | generate（+ review 一份零引用死副本） | **build** 独有；**review 那份删除** |
| `scripts/scaffold.mjs` | generate | **build** |
| `assets/default-tokens.css` | generate | **build** |
| `evals/`（e1–e3 + fixtures） | generate | **build**（判据依赖 verify 与原型产物，必须同侧） |
| `example/` | generate | **build**（原型 + flow.json）；blueprint 补一份思路报告样例（可后置） |

## 五、跨技能引用改造（真实活引用 5 个文件）

| 文件 | 改动 |
|---|---|
| `zh/commands/flow.md` | R11/R12/R13 重排、技能映射表、消费说明、前置依赖表、选项范围行 |
| `zh/skills/prototype/review/SKILL.md` | `generate` → `build`；输入契约补《原型蓝图》 |
| `zh/skills/prototype/review/references/01-quality-criteria.md` | `generate` → `build` |
| `zh/skills/prototype/review/templates/prototype_review_report_template.md` | `generate` → `build` |
| `src/core/assets/layout.ts` | 仅第 19 行注释同步 |

（`tmp/` 下的备份与旧 `requirements-engineering` 副本不改；`README.md` 不入仓，忽略。）

## 六、flow.md 接线

| 编号 | 名称 | 技能 | 前置 |
|---|---|---|---|
| R11 | 生成原型蓝图 | `prototype:blueprint` | 需求文档（R01/R02 任一） |
| R12 | 按蓝图制作原型 | `prototype:build` | 已确认的《原型蓝图》 |
| R13 | 评审已有原型 | `prototype:review` | 原型文件 + 蓝图（建议） |

阶段链：R11 → R12 → R13；回路：R13「不得交付」→ R12 修复 → 重评审。
菜单项由 5 变 6，上限 10，余量足够。

## 七、执行批次（低风险分批）

| 批次 | 内容 | 风险 |
|---|---|---|
| 1 | 备份 + `git mv generate → build` + 5 处引用改名 + 回归 | 低（纯改名） |
| 2 | 新建 `blueprint/`（SKILL.md + 裁剪版 00-basis + 02 + PROVENANCE） | 低（纯新增） |
| 3 | 拆 build 的 SKILL.md（删 Step 3.1–3.4 与内部评审调用，Step 重编号） | 中 |
| 4 | review 改造（删 verify 死副本 + 输入契约补蓝图） | 低 |
| 5 | flow.md 接线 + layout.ts 注释 | 低 |
| 6 | 全量回归 + PROVENANCE 记录 + 记忆更新 | — |

## 八、回归清单

- 三技能各跑 `evals/run.mjs --selftest`
- 仓库级 `npx vitest run test/ts/skills-install.test.ts`（现 12/12）
- 全仓检索 `prototype{{SKN_SPR}}generate` 应只剩 `tmp/` 备份
- 检索禁用路径字面量（以点开头的上级路径写法）

## 九、风险

1. 用户 9-14 晚刚手工重写 generate 的 Step 骨架，本次会再动一遍——建议分批推进，每批回归。
2. `blueprint` 的 00-basis 裁剪版与 `build` 全量版存在同源内容的双份，需在两处文件头互指，并说明源在 build。
3. 现有 `example/deliverables.md` 是 6+1 交付物样例，拆分后要按环节归属重新标注（可后置）。
