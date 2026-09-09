#!/usr/bin/env python3
"""Batch-2c edits for polaris-flow.md (final batch):
1) P01-P03 stage-chain details live ONLY in the closing complexity table;
   the step-4 routing table keeps pointers. P03 chain moved verbatim into closing table.
2) Handoff rules consolidated: 3.3 becomes the authoritative contract (now includes
   需求内容), step-4 references it, 0.5 tail and step-5 item 1 become pointers.
Each old string must appear exactly once; abort without writing otherwise."""
import sys

PATH = "/Users/weiliu/Documents/work/projects/polaris/polaris-flow/assets/zh/commands/polaris-flow.md"

PAIRS = [
    # C1a: 第四步路由表 P01-P03 阶段链 → 指针
    ("| **P01** 实现简单功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` | tweak（轻量澄清 → tasks → 实施 → 出口检查）→ ship |\n"
     "| **P02** 实现常规功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` | normal（轻量澄清 → 四件套 → 双向守门 → 终版细计划 → 合并主审 → 实施 → 出口检查）→ ship |\n"
     "| **P03** 实现复杂功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` | specify → plan → design(可选) → tasks → build → verify → ship → retro |",
     "| **P01** 实现简单功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` | 见文末《功能类选项的复杂度判定》 |\n"
     "| **P02** 实现常规功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` | 见文末《功能类选项的复杂度判定》 |\n"
     "| **P03** 实现复杂功能 | `polaris{{SKN_SPR}}coding{{SKN_SPR}}specify` | 见文末《功能类选项的复杂度判定》 |"),
    # C1b: 文末表承接 P03 完整链路，并声明唯一详述出处
    ("P01 / P02 / P03 的差别在于**走的阶段数**，选择时按以下标准判断：",
     "P01 / P02 / P03 的差别在于**走的阶段数**，选择时按以下标准判断。本表是 P01–P03 阶段链与产物的**唯一详述出处**（第四步路由表只保留指针）："),
    ("| **P03** 复杂 | 跨系统/跨服务、高风险、需专项设计（数据模型/接口契约/领域模型） | 完整链路（design 可选，plan 完成时询问是否深化）+ 专项设计与强制评审，交付后复盘 |",
     "| **P03** 复杂 | 跨系统/跨服务、高风险、需专项设计（数据模型/接口契约/领域模型） | 完整链路：specify → plan → design（可选，plan 完成时询问是否深化）→ tasks → build → verify → ship → retro；含专项设计与强制评审、交付后复盘 |"),
    # C2a: 3.3 成为交接口径唯一权威，补上「需求内容」
    ("### 3.3 收集完成后的交接口径\n\n把 `附加上下文` 连同 `已选功能` 一起交给第四步加载的技能，并在交接时明确要求：\n\n"
     "1. 技能在**自身流程开始前**，先完整读取 `附加上下文` 中的全部文件/目录，或理解文字说明\n"
     "2. 读取失败、文件不存在或内容与所选功能明显无关时，**先回报用户再决定是否继续**，不得静默跳过\n"
     "3. 后续各阶段的产物必须以上下文为准绳，与上下文冲突时以用户提供的上下文优先",
     "### 3.3 收集完成后的交接口径\n\n把 `附加上下文` 连同 `已选功能` / `需求内容` 一起交接给第四步加载的技能，第四步按本口径显式告知技能：\n\n"
     "1. 技能在**自身流程开始前**，先完整读取 `附加上下文` 中的全部文件/目录（及 `需求内容`），或理解文字说明\n"
     "2. 读取失败、文件不存在或内容与所选功能明显无关时，**先回报用户再决定是否继续**，不得静默跳过\n"
     "3. 后续各阶段的产物必须以上下文为准绳，与上下文冲突时以用户提供的上下文优先"),
    # C2b: 第四步交接段去重，改为引用 3.3
    ("加载技能时**必须同时交接** `已选功能` / `附加上下文` / `需求内容` 三个字段，并显式告知技能：\n开工前先读取 `需求内容`（Step 0 收集的开发意图）与 `附加上下文`（Step 3 收集的参考资料）清单中的全部材料；\n`需求内容` 为空时（仅对非开发类）直接按其自身流程执行。\n`需求内容` 字段名沿用至 tweak / normal / specify / hotfix，被加载技能按以下约定读取：",
     "加载技能时**必须同时交接** `已选功能` / `附加上下文` / `需求内容` 三个字段，并显式告知技能遵守 3.3 的交接口径（先读取全部材料、异常先回报、上下文优先）。\n`需求内容` 为空时（仅对非开发类）技能直接按其自身流程执行。\n`需求内容` 字段名沿用至 tweak / normal / specify / hotfix，被加载技能按以下约定读取："),
    # C2c: 0.5 尾部清单 → 指针（唯一清单在第四步，且多出 hotfix 一行）
    ("被加载的技能必须消费 `需求内容`：\n\n- tweak / normal：需求内容作为其「轻量澄清 / intention」的输入\n- specify：需求内容作为 Phase 0 discovery 的 seed",
     "技能侧如何消费 `需求内容`，见第四步的「约定读取」清单（tweak / normal / specify / hotfix 各有映射）。"),
    # C2d: 第五步第 1 条尾句 → 指针
    ("1. 加载上表对应的入口技能，严格按技能内定义的流程执行；技能须先消费 `附加上下文` 再进入自身流程",
     "1. 加载上表对应的入口技能，严格按技能内定义的流程执行（交接口径见 3.3 与第四步）"),
]

with open(PATH, encoding="utf-8") as f:
    text = f.read()

for i, (old, _new) in enumerate(PAIRS, 1):
    n = text.count(old)
    if n != 1:
        sys.exit(f"ABORT: pair {i} matched {n} times (expected 1); file not modified")

for old, new in PAIRS:
    text = text.replace(old, new, 1)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(text)

print(f"OK: applied {len(PAIRS)} edits")
