#!/usr/bin/env python3
"""Batch-2b edits for polaris-flow.md:
1) 「需求三要素」canonical definition in zero-step intro; 快捷路径 & 0.1 reference it.
   (0.2 option description stays self-contained — it is user-facing text.)
2) 0.5 状态衔接 dedup against 快捷路径: keep only the deltas.
Each old string must appear exactly once; abort without writing otherwise."""
import sys

PATH = "/Users/weiliu/Documents/work/projects/polaris/polaris-flow/assets/zh/commands/polaris-flow.md"

PAIRS = [
    # B1: 快捷路径里的三要素复述 → 引用零步定义
    ("**但**：若用户首次输入里已包含**完整的需求描述**（含动作 + 目标 + 角色/数据/流程中至少 2 项），\n直接填入 `需求内容 = 已收集`，跳过零步的 0.1 识别与 0.2 强制收集。",
     "**但**：若用户首次输入里已包含满足「需求三要素」的完整需求描述（定义见零步开头），\n直接填入 `需求内容 = 已收集`，跳过零步的 0.1 识别与 0.2 强制收集。"),
    # B2: 零步开头落「需求三要素」唯一定义
    ("**目的**：开发类路径是产物生成路径（代码 / 修复 / 重构），无需求进入会产出**与意图错位**的产物。预检确保至少有一段**可被评估**的需求文本，复杂时还能让用户委托命令自动判档路由。",
     "**目的**：开发类路径是产物生成路径（代码 / 修复 / 重构），无需求进入会产出**与意图错位**的产物。预检确保至少有一段**可被评估**的需求文本，复杂时还能让用户委托命令自动判档路由。\n\n"
     "**需求三要素**（0.1 / 0.2 / 快捷路径统一引用此定义）：**动作**（实现 / 修复 / 添加 / 重构 / 改造 / 调整 / 删除）+ **目标**（具体功能名 / 模块名 / bug 现象）+ **至少 2 项细节**（角色 / 数据 / 流程 / 约束 / 验收条件中任选 2 项）。三者齐备才算「已有需求」。"),
    # B3: 0.1 判定规则 1 → 引用定义
    ("1. 用户消息含**完整需求三要素**——「**动作**（实现 / 修复 / 添加 / 重构 / 改造 / 调整 / 删除）+ **目标**（具体功能名 / 模块名 / bug 现象）+ **至少 2 项**（角色 / 数据 / 流程 / 约束 / 验收条件中任选 2 项）」",
     "1. 用户消息含完整的「需求三要素」（定义见本节开头）"),
    # B5: 0.5 与快捷路径去重，只保留差异
    ("### 0.5 状态衔接\n\n自动评估完成后：\n\n- `已选功能` 已填 → **跳过**第一步（功能类别）与第二步（具体功能）\n- `需求内容` 已填 → **跳过**第三步（3.1 询问是否附加上下文 / 3.2 按答复收集）——但仍可继续**额外**附加上下文（用户在 0.4 之后补充参考资料、目标文件等），**询问一次**后按原 3.2 走\n- **直接进入第四步**（按选择加载技能）——`需求内容` 作为独立字段与 `附加上下文` 一并交接给被加载的技能",
     "### 0.5 状态衔接\n\n自动评估完成后，跳步规则与「快捷路径」一致（`已选功能` 已填 → 跳过第一/二步；`需求内容` 已填 → 跳过 0.1/0.2 强制收集）。仅以下两处差异：\n\n"
     "- **第三步不完整重跑**：不走 3.1 的三选项询问，改为**询问一次**「是否额外附加上下文」（用户可在 0.4 之后补充参考资料、目标文件等），按原 3.2 处理答复\n"
     "- **随后直接进入第四步**——`需求内容` 作为独立字段与 `附加上下文` 一并交接给被加载的技能"),
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
