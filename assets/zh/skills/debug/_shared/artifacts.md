# debug 族 · 产物契约

运行态一律落 `.polaris/tasks/<issue_id>/`。各阶段**只允许**写自己负责的节，禁止跨段改写上游结论；发现上游结论有误必须**回退到该段重出**，并在 `state.yaml` 的 `regressions[]` 留痕，**不得**就地改写。

## 产物清单

| 文件 | 归属段 | 说明 |
|------|--------|------|
| `diagnose-brief.md` | `triage` 建、`diagnose`/`prescribe` 回填 | **过程档案**：原始证据原样、调研路径、中间结论与**被推翻的假设**；只追加、不美化 |
| `reviews/rca-report.md` | `diagnose` 建 | **根因分析报告（成品）**：人确认根因的对象、`prescribe` 的输入；九节见下 |
| `tasks.md` | `prescribe` 建（折叠时 `patch` 建） | 必须过 `tasks-lint` |
| `verification.md` | `patch` 建「自验」节；`prove` 回填「独立验证」节 | 命令 + 原始输出 + 结论，三件套 |
| `reviews/bugfix-report.md` | `closeout` 建 | 交付结论报告（根因与证据链**引用** `rca-report.md`，不重述）；`reviews/` 需 `mkdir -p` |
| `state.yaml` | 初始化建 | 运行态 + `regressions[]` 回退留痕 |

归档：`docs/troubleshooting/<issue_id>/`（扁平放 `diagnose-brief.md` / `rca-report.md` / `tasks.md` / `bugfix-report.md`，**复制不移动**），并追加一行摘要到 `docs/troubleshooting/INDEX.md`。归档**回读校验 5 项**（4 个文件 + `INDEX.md`）。

## 分段回填写明表

| 文件 | 节 | 写入段 |
|------|----|--------|
| `diagnose-brief.md` | 缺陷信息（含 `历史同类`） | `triage` |
| `diagnose-brief.md` | 输入四要素 / 证据提取 / 复现 | `triage` |
| `diagnose-brief.md` | 根因 / 排除记录 / 解释范围 | `diagnose` |
| `diagnose-brief.md` | 修复方向（改/加/删、影响面、回归范围） | `diagnose` 起草，`prescribe` 定稿 |
| `verification.md` | 自验（命令 + 原始输出 + 结论） | `patch` |
| `verification.md` | 独立验证（五维 + 人回填结果） | `prove` |

`reviews/rca-report.md` 由 `diagnose` **独写**；下游只读取引用，不得改写。

## 过程档案 vs 成品报告（两条防退化规则）

- **档案禁止被美化**——把过程档案整理成漂亮文档，等于原始证据丢失，事后既不能复盘也没法支撑同类复用；中间结论与失败尝试要留着，防重复踩坑。
- **报告禁止变流水账**——"我试过什么、又失败了什么"属于档案，不进报告；报告只写结论与证据指向。

## RCA 报告九节

`rca-report.md` 固定九节：① 摘要与影响面 ② 时间线（生产必填 / 测试标"不适用"）③ 根因（**直接原因与根本原因分开写** + `文件:行`）④ 证据链 ⑤ 排除记录（≥1 替代假设 + 排除依据）⑥ 解释范围（残留现象显式列出）⑦ **发现路径**（为何没被更早拦住）⑧ 结论置信度与未决项 ⑨ **改进项（不在本次范围，只登记、不执行）**。

> 报告中每项结论都必须能在档案里找到对应证据（引用节名）。第 9 节改进项**不进入本次改动范围**，归档后供后续排期；`patch` 段的 diff 校验应把改进项视为夹带并回退。
