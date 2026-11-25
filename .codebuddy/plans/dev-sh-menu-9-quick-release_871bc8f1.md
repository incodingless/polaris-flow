---
name: dev-sh-menu-9-quick-release
overview: 在 devops/dev.sh 新增菜单 9，依次执行构建检查、发布（带 --force）与离线打包，作为菜单 99 去掉技能同步步骤的快速发版路径。
todos:
  - id: dev-sh-menu9
    content: 参数化 run_flow 并新增菜单 9 的菜单项、dispatch 与用法映射
    status: completed
  - id: changelog-menu9
    content: 在 0.9.1 的 Changed 分组追加菜单 9 变更条目
    status: completed
    dependencies:
      - dev-sh-menu9
  - id: verify-menu9
    content: 用 [skill:review] 评审并用 bash -n 与 list 校验菜单
    status: completed
    dependencies:
      - dev-sh-menu9
      - changelog-menu9
---

## User Requirements

在 `devops/dev.sh` 的菜单中新增编号 9，依次执行现有菜单 2、8、5 对应的动作：构建检查（`build.sh --check`）→ 发布到 Nexus → 打离线安装包。

经澄清确认：菜单 9 的发布步骤必须带 `publish.sh --force`，与菜单 99 的全流程发布一致；菜单 9 定位为「99 减去技能同步」，保留 99 已有的发版前置检查、失败即中止、结束回显等流程语义，唯独跳过菜单 4 的附带技能同步。

## Product Overview

`devops/dev.sh` 是维护者的状态看板与命令菜单入口。新增菜单 9 后，发版组形成两条组合路径：99 为完整流程（含技能同步），9 为快速流程（不含技能同步），两者共用同一套流程实现与 `--force` 发布策略。

## Core Features

- 菜单 9 显示为 `run: 2 - 8 - 5`，说明文字标注「快速发版（不含技能同步）」。
- 执行顺序固定为构建检查 → 带 `--force` 的发布 → 打离线包；任一步失败立即中止，前置检查取消时按既有约定处理。
- `h 9` 与 `h 99` 一致，指向 `devops/dev.sh` 自身的用法头部。
- 菜单 8（单独发布，不带 `--force`）与菜单 99（完整流程）的既有行为完全不变。

## Tech Stack Selection

沿用现有维护者脚本：Bash + `devops/` 下既有脚本（`build.sh` / `publish.sh` / `package.sh`），不引入任何新依赖。仍归属项目规范允许保留 `.sh` 的非运行时链（维护者构建 / 发布 / 打包），不改 `.mjs`、不新增运行时脚本。

## Implementation Approach

唯一修改文件：`/Users/weiliu/Documents/work/projects/polaris/polaris-flow/devops/dev.sh`。

采用「单函数参数化」而非复制流程：给 `run_flow()` 增加一个 `skip_sync` 标志位，由它决定流程标题、步骤总数以及是否执行技能同步段。菜单 99 传 0（维持原行为），菜单 9 传 1（跳过同步）。理由：两个流程除同步步骤外完全同构，参数化只动一个函数、避免复制 40 行发布与打包逻辑，符合项目「选择能完整满足需求的最简实现」与 DRY 约定；不新建辅助函数或抽象层。

具体改动点：

- `print_menu()` 在发版组、`99` 之前插入菜单 9 一行：命令列写 `run: 2 - 8 - 5`，说明列写「快速发版（不含技能同步）」。不写参数说明，遵守文件头约束。
- `run_flow()` 改为接收 `skip_sync` 参数：为 1 时标题用「快速发版」、步骤计数按 3 步显示、整段跳过同步技能及其退出码 2 的询问逻辑；为 0 时保留标题「全流程构建」、4 步计数与现有同步逻辑原样不动。构建检查、发版前置检查、`publish.sh --force`、打离线包、失败中止与结束回显在两条路径中完全一致。
- `run_item()` 增加 `9) run_flow 1 ;;`，并把 `99) run_flow ;;` 改为 `99) run_flow 0 ;;`。不使用 `exec`，与现有组合流程一致。
- `target_file()` 把 `9` 并入 `99` 的映射，均返回 `devops/dev.sh`，使 `h 9` 行为与 `h 99` 一致。

性能与可靠性：本改动仅增加一次参数判断与一个菜单分支，无新增 I/O、无网络调用；发布与打包仍是原有的串行阻塞执行。

## Implementation Notes (Execution Details)

- 跨平台：保留现有 `printf` / `case` / `read` 写法，不引入 `sed -i` 等 GNU/BSD 不兼容操作；不改 `set -uo pipefail`。
- 注释：为参数化后的 `run_flow()` 补齐中文函数注释，明确说明「跳过技能同步」的语义与 `skip_sync` 取值含义；注释须准确反映代码逻辑。
- 爆炸半径：不修改菜单 1 至 8 的任何 dispatch，不修改 `precheck_publish()`，不修改 `run_flow()` 中发布与打包的步骤内容；菜单 99 对外表现（标题、4 步计数、同步失败处理）必须保持不变。
- 验证时只做只读或无害检查：`bash -n devops/dev.sh` 校验语法、`bash devops/dev.sh list` 校验菜单渲染、`bash devops/dev.sh h 9` 校验映射；严禁直接执行编号 9 或 99，那会触发真实发布与打包。
- 上一计划的命令执行通道曾连续因确认提示超时被取消；若本次仍无法执行校验命令，须如实报告，不得声称已验证。

## Architecture Design

不新增架构层次。调用链保持：入口 `case` → `run_item()` → `run_flow(skip_sync)` → 既有 `build.sh` / `precheck_publish()` / `publish.sh --force` / `package.sh`。判定逻辑集中在单个参数分支，菜单渲染、dispatch、用法映射三处各自加一行，沿用文件头写明的「菜单文字一行 + dispatch 一个分支」约定。

## Directory Structure

```
polaris-flow/
├── devops/
│   └── dev.sh       # [MODIFY] 新增菜单 9（run: 2 - 8 - 5，快速发版不含技能同步）；run_flow() 参数化 skip_sync，为 1 时跳过技能同步并按 3 步显示；run_item() 增加 9 分支并让 99 显式传 0；target_file() 将 9 与 99 一起映射到 devops/dev.sh。
└── CHANGELOG.md     # [MODIFY] 在当前顶部 0.9.1 条目的 Changed 分组追加一条，说明新增菜单 9 快速发版及其与菜单 99 的差异；不擅自升版本号。
```

## Agent Extensions

### Skill

- **review**
- Purpose: 在改动完成后评审 `devops/dev.sh`，确认菜单 8 与菜单 99 的既有语义未被改写、发布仍带 `--force`、参数化只影响新增的菜单 9 路径。
- Expected outcome: 输出结构化评审结论，明确确认菜单 1 至 8、99 的 dispatch 与 `precheck_publish()` 未变，且新增分支不会误触发真实发布。