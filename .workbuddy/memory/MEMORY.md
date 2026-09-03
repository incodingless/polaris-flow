# Polaris Flow — 项目长期记忆

## 资产分发约定

- **命令落盘**：`assets/{zh,en}/commands/*.md` → `<contextDir>/commands/polaris/<file>.md`
  （带 `polaris/` 子目录）。文件名即命令名，`polaris-flow.md` → `/polaris-flow`。
- **`{{SKN_SPR}}` 占位符**：技能与命令共用，安装时按 `skillsLayout` 展开 —— nested（claude / cursor）→ `:`，
  flat（trae / trae-cn）→ `-`。命令正文引用技能**必须**用占位符，写死必然在另一布局失效。
- **`init` 默认语言是 `en`**，而 `assets/en/skills/` 实际为空（仅 `.gitkeep`）。
  验证安装效果必须 `polaris init --lang zh`，否则只装到共享内容、0 个技能。

## 技能资产现状

- **在用族**（`assets/zh/skills/`）：
  - `coding/`: build, clarify, design, plan, propose, retro, ship, verify（**无 refactor**）
  - `prd/`: discovery, draft, refine, review, ship, testability
  - `testing/`: acceptance, case
  - `subagent-dispatch/`、`subagent-probe/`（各自带 `references/`）
  - `maintance/`：**空目录**，0 文件，git 历史也无内容
  族名在 `layout.ts` 与 `install/skills.ts` 的 `SKILL_FAMILIES` 中注册，**新增/改名必须同步两处**。
  **写命令路由表前先 `ls assets/zh/skills/<族>/` 核对**——凭印象写必然挂。
- **⚠️ 测试族固定为 `testing`，不可改回 `test`** —— `test` 与仓库根 `test/`（单元测试）及保留目录
  冲突。族名一旦与 `assets/<lang>/skills/` 下的真实目录名不一致，`parseSkillAssetPath` 会把族目录
  误判成独立技能（落盘 `polaris/testing/` 带 `case/` 子目录，而非两个叶技能），命令里的
  `polaris{{SKN_SPR}}testing{{SKN_SPR}}case` 就永远路由不到。
- **不安装**：`assets/zh/skills/requirements-engineering/`（被 `shouldSkipSkillShortPath` 跳过，
  与 `skills/prd/` 功能重叠的旧版）。改 PRD 技能改 `skills/prd/`，不要改这里。

## 已知陈旧项（勿踩）

- **`assets/zh/commands/hotfix.md` 与 `assets/en/commands/hotfix.md` 是死链命令桩**：
  正文仅 `Use the polaris:hotfix skill.`，而该技能不存在（既非族也非独立技能）。
- **安装类测试的 timeout 债**：任何调 `installPolarisForPlatform` / `copyPolarisSkillsForPlatform` 的用例，
  实测需 11~15s（拷贝 200+ 文件），必须显式给 `{ timeout: 60_000 }`，否则默认 5s 必然超时。
  照 `commands-install.test.ts` / `skills-install.test.ts` 的 `INSTALL_TIMEOUT` 写法加即可。
  `session-start.test.ts` 里也有同类超时失败（未修）。
- `assets/zh/skills/README.md` 引用了不存在的 `delivery/`、`explore-router/`、`idea-discovery/`、
  `hard-stops.md`。
- `polaris.example.yaml` / `config.example.yaml` / `ask-question-react.md` /
  `subagent-probe/references/platform-probe.md` 仍残留 `qoder` 等已移除平台的枚举项。
- `src/core` 有 3 个 prettier 未格式化文件、若干 eslint 错误，均为存量，提交前别被 CI 误伤。

## 命令资产（multi-turn 询问类）编写约定

- 多轮 `AskUserQuestion` 询问，每一轮必须各占一个**一级标题**（`## 第一步` / `## 第二步` …）。
  塞进同一节的 `###` 子标题里，模型会按标题层级直接跳到下一个「动作型」步骤而漏问。
- 每一轮都要给**完整可原样复制的工具调用 payload**（含 `question` / `header` / `multiSelect`），
  只给 `options` 片段会让模型退化成纯文本罗列，选项弹不出来。
- 配一个「执行状态」小节记录已选值（如 `已选类别` / `已选功能`），要求每步结束回查，缺值不许往下走。
- HARD-STOP 里显式写死「禁止拿到某级答案后直接跳去执行」与「禁止纯文本罗列代替工具调用」。
- `AskUserQuestion` 单次选项上限 4 个；菜单项超过 4 个就拆成「类别 → 具体项」两级串行。
- 路由型命令在「选完做什么」与「加载技能」之间必须插入**上下文收集步骤**，否则用户没机会交代
  要读哪些文件。收集到的是原样清单，交接时要求技能先消费上下文再进自身流程。

## 发问相关约定（全局）

- **禁止在 SKILL 内写死 `AskUserQuestion`**（`assets/zh/policies/ask-question-react.md` 明令）。
  工具名须按 `.polaris/config.yaml` 的 `platform` 查「平台询问工具注册表」得到；单次选项上限 4 个，
  平台不支持单次多 question 时拆多次调用串行。
- 共享策略（`decision-point.md` / `ask-question-react.md` / `response-posture.md` 等）打包时注入
  各叶技能 `policies/` 目录，源码树里看不到 —— 技能内写 `./policies/xxx.md` 是正常的，不是坏引用。
- 让用户从列表里选一项时，要写「判定规则」表区分**明确选择**与**不算选择**
  （「都要做」「按建议来」「只确认方案」都不算），并接受「名称或编号」两种回答。
- **命令资产不能引用 `./policies/xxx.md`**：共享 policies 只注入叶技能（`install/skills.ts` Step 3），
  插件根没有 `policies/`；且不能拷到 `commands/` 下——Claude Code 会把 `commands/**/*.md` 全注册成命令。
  命令需要发问时**内联精简的「平台询问工具注册表」**，注明与 `ask-question-react.md` 冲突时以后者为准。

## 流程约定

- 双语言：技能先写中文版，用户确认后再同步英文版；**中英文未同步前不写 Changelog**。
- **`task-init` 只建目录 + `state.yaml`，不写 workflow 游标**；`append-active` 是独立 op。
  要「可恢复的任务/基础任务」必须两者都做，缺游标 = `get-active-changes` 恢复时不可见。
- Qoder 在 0.1.0 已刻意从平台列表移除，如需恢复属新决策，勿默认其仍受支持。
