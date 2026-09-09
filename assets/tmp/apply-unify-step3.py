#!/usr/bin/env python3
"""Unify step-3 behavior: 0.5's bespoke single-question variant is removed;
both 快捷路径 and auto-eval paths run full 3.1/3.2. Rationale: 3.1 is already a
single question call, so the variant saves no interaction and only forks behavior."""
import sys

PATH = "/Users/weiliu/Documents/work/projects/polaris/polaris-flow/assets/zh/commands/polaris-flow.md"

OLD = (
    "自动评估完成后，跳步规则与「快捷路径」一致（`已选功能` 已填 → 跳过第一/二步；`需求内容` 已填 → 跳过 0.1/0.2 强制收集）。仅以下两处差异：\n\n"
    "- **第三步不完整重跑**：不走 3.1 的三选项询问，改为**询问一次**「是否额外附加上下文」（用户可在 0.4 之后补充参考资料、目标文件等），按原 3.2 处理答复\n"
    "- **随后直接进入第四步**——`需求内容` 作为独立字段与 `附加上下文` 一并交接给被加载的技能"
)

NEW = (
    "自动评估完成后，跳步规则与「快捷路径」一致（`已选功能` 已填 → 跳过第一/二步；`需求内容` 已填 → 跳过 0.1/0.2 强制收集），"
    "第三步照常走 3.1/3.2（用户可在此时补充 0.4 之后想到的参考资料、目标文件等）。"
    "随后**直接进入第四步**——`需求内容` 作为独立字段与 `附加上下文` 一并交接给被加载的技能。"
)

with open(PATH, encoding="utf-8") as f:
    text = f.read()

n = text.count(OLD)
if n != 1:
    sys.exit(f"ABORT: old string matched {n} times (expected 1); file not modified")

text = text.replace(OLD, NEW, 1)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(text)

print("OK: 1 edit applied")
