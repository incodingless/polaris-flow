#!/usr/bin/env python3
"""
state.yaml 三方一致性校验：模板 vs TypeScript 类型 vs SKILL.md 字段引用

用法：python3 scripts/check_state_yaml_three_way.py
退出码：0 全过；1 有失配

检查：
1. 模板 runtime.* 字段集合 ⊆ TaskRuntimeState 类型字段集合
2. 模板 workflow.* 字段集合 ⊆ TaskWorkflowState 类型字段集合
3. 模板顶层字段集合 ⊆ TaskState 顶层字段集合
4. SKILL.md 引用的 runtime.* / workflow.* 路径全部在模板中存在
"""
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = REPO_ROOT / "assets/shared/templates/state.example.yaml"
TS_TASK_STATE = REPO_ROOT / "src/core/config/task-state.ts"
CODING_DIR = REPO_ROOT / "assets/zh/skills/coding"

# ---------- 工具函数 ----------

def parse_simple_yaml_top_keys(yaml_path: Path):
    """解析模板顶层字段；嵌套结构只取字段名集合"""
    text = yaml_path.read_text(encoding="utf-8")
    # 顶层字段
    top = set()
    nested_runtime = set()
    nested_workflow = set()
    in_runtime = False
    in_workflow = False
    cur_workflow_sub = None  # 'tweak' | 'normal' | None
    for raw in text.splitlines():
        # 跳过注释和空行
        stripped = raw.strip()
        if stripped.startswith("#") or not stripped:
            continue
        # 顶层字段：行首无缩进、以 key: 结尾
        if not raw.startswith(" ") and not raw.startswith("\t"):
            if ":" in stripped and not stripped.startswith("-"):
                key = stripped.split(":", 1)[0].strip()
                if key == "runtime":
                    in_runtime = True
                    in_workflow = False
                    cur_workflow_sub = None
                    top.add(key)
                    continue
                elif key == "workflow":
                    in_runtime = False
                    in_workflow = True
                    cur_workflow_sub = None
                    top.add(key)
                    continue
                else:
                    in_runtime = False
                    in_workflow = False
                    cur_workflow_sub = None
                    top.add(key)
                    continue
        # runtime 内
        if in_runtime:
            m = re.match(r"^  ([a-zA-Z_]+):", raw)
            if m:
                nested_runtime.add(m.group(1))
        # workflow 内
        if in_workflow:
            m = re.match(r"^  ([a-zA-Z_]+):", raw)
            if m:
                cur_workflow_sub = m.group(1)
                nested_workflow.add(m.group(1))

    return top, nested_runtime, nested_workflow


def parse_ts_runtime_subfield_map(ts_path: Path):
    """从 task-state.ts 提取每个 TaskRuntimeState 子段（TaskRuntimeSpecifyState 等）的字段集合
    返回 dict: {seg_name: set(fields)}"""
    text = ts_path.read_text(encoding="utf-8")
    sub_types = {
        "specify": "TaskRuntimeSpecifyState",
        "propose": "TaskRuntimeProposeState",
        "design": "TaskRuntimeDesignState",
        "plan": "TaskRuntimePlanState",
        "build": "TaskRuntimeBuildState",
        "verify": "TaskRuntimeVerifyState",
        "ship": "TaskRuntimeShipState",
        "deepread": "TaskRuntimeDeepreadState",
    }
    result = {}
    for seg, type_name in sub_types.items():
        m = re.search(rf"export\s+type\s+{type_name}\s*=\s*\{{([\s\S]*?)\n\}}", text)
        if not m:
            continue
        block = m.group(1)
        fields = set(re.findall(r"\b([a-z_][a-z0-9_]*)\?:\s*", block))
        result[seg] = fields
    return result


def parse_ts_workflow_subfield_map(ts_path: Path):
    """从 task-state.ts 提取 TaskWorkflowTweakState / TaskWorkflowNormalState 的字段集合"""
    text = ts_path.read_text(encoding="utf-8")
    result = {}
    for seg, type_name in [("tweak", "TaskWorkflowTweakState"), ("normal", "TaskWorkflowNormalState")]:
        m = re.search(rf"export\s+type\s+{type_name}\s*=\s*\{{([\s\S]*?)\n\}}", text)
        if not m:
            continue
        block = m.group(1)
        fields = set(re.findall(r"\b([a-z_][a-z0-9_]*)\?:\s*", block))
        result[seg] = fields
    return result


def parse_ts_top_fields(ts_path: Path):
    """从 task-state.ts 提取 TaskState 顶层字段"""
    text = ts_path.read_text(encoding="utf-8")
    m = re.search(r"export\s+interface\s+TaskState\s*\{([\s\S]*?)\n\}", text)
    if not m:
        return set()
    block = m.group(1)
    fields = set(re.findall(r"\b([a-zA-Z_][a-zA-Z0-9_-]*)\?:\s*", block))
    # 排除 'kebab-case' 重复
    return fields


def parse_skill_refs(coding_dir: Path):
    """从 coding SKILL.md 中提取 runtime.* 与 workflow.* 字段引用路径
    返回 (runtime_refs, workflow_refs)，每条是 tuple (seg, sub or None)"""
    runtime_refs = set()
    workflow_refs = set()
    if not coding_dir.exists():
        return runtime_refs, workflow_refs
    pattern = re.compile(r"\b(runtime|workflow)\.([a-z_]+)(?:\.([a-z_]+))?")
    for md in coding_dir.rglob("*.md"):
        for m in pattern.finditer(md.read_text(encoding="utf-8")):
            ns, seg, sub = m.group(1), m.group(2), m.group(3)
            if ns == "runtime":
                runtime_refs.add((seg, sub))
            elif ns == "workflow":
                workflow_refs.add((seg, sub))
    return runtime_refs, workflow_refs


# ---------- 主校验 ----------

def main():
    if not TEMPLATE.exists():
        print(f"❌ 模板不存在：{TEMPLATE}")
        sys.exit(1)
    if not TS_TASK_STATE.exists():
        print(f"❌ TypeScript 不存在：{TS_TASK_STATE}")
        sys.exit(1)

    print("=" * 60)
    print("state.yaml 三方一致性校验")
    print("=" * 60)

    # 1. 模板字段
    tpl_top, tpl_runtime, tpl_workflow = parse_simple_yaml_top_keys(TEMPLATE)
    print(f"\n[模板] 顶层字段：{len(tpl_top)} 个")
    print(f"[模板] runtime 子段：{sorted(tpl_runtime)}")
    print(f"[模板] workflow 子段：{sorted(tpl_workflow)}")

    # 2. TS 字段
    ts_top = parse_ts_top_fields(TS_TASK_STATE)
    ts_runtime_subfields = parse_ts_runtime_subfield_map(TS_TASK_STATE)
    ts_workflow_subfields = parse_ts_workflow_subfield_map(TS_TASK_STATE)
    ts_runtime = set(ts_runtime_subfields.keys())
    ts_workflow = set(ts_workflow_subfields.keys()) | {"mode"}
    print(f"\n[TS] TaskState 顶层字段：{len(ts_top)} 个")
    print(f"[TS] TaskRuntimeState 子段：{sorted(ts_runtime)}")
    print(f"[TS] TaskWorkflowState 子段：{sorted(ts_workflow)}")
    print(f"[TS] runtime 子段字段：{ {k: len(v) for k, v in ts_runtime_subfields.items()} }")
    print(f"[TS] workflow 子段字段：{ {k: len(v) for k, v in ts_workflow_subfields.items()} }")

    fail = 0

    # 3. 模板 runtime ⊆ TS runtime
    miss_in_ts = tpl_runtime - ts_runtime
    if miss_in_ts:
        print(f"\n❌ 模板 runtime 子段在 TS 中缺失：{sorted(miss_in_ts)}")
        fail += 1
    else:
        print(f"\n✓ 模板 runtime 子段全部在 TS 中定义")

    # 4. 模板 workflow ⊆ TS workflow
    miss_in_ts_wf = tpl_workflow - ts_workflow
    if miss_in_ts_wf:
        print(f"❌ 模板 workflow 子段在 TS 中缺失：{sorted(miss_in_ts_wf)}")
        fail += 1
    else:
        print(f"✓ 模板 workflow 子段全部在 TS 中定义")

    # 5. 顶层字段大致对齐
    tpl_top_norm = {k.replace("-", "_") for k in tpl_top}
    miss_top = tpl_top_norm - {f.replace("-", "_") for f in ts_top}
    if miss_top:
        print(f"❌ 模板顶层字段在 TS 中缺失：{sorted(miss_top)}")
        fail += 1
    else:
        print(f"✓ 模板顶层字段全部在 TS 中定义")

    # 6. SKILL.md 引用校验：seg.sub 两段路径必须存在于模板 + TS；
    #    单层引用（seg 无 sub）多为路径名/工具名（workflow.yaml / workflow.lock），
    #    不严格校验
    skill_runtime, skill_workflow = parse_skill_refs(CODING_DIR)
    print(f"\n[技能] runtime 引用：{len(skill_runtime)} 条")
    print(f"[技能] workflow 引用：{len(skill_workflow)} 条")

    bad_runtime = []
    for seg, sub in skill_runtime:
        if not sub:
            continue
        if seg not in tpl_runtime:
            bad_runtime.append(f"{seg}.{sub}")
            continue
        subfields = ts_runtime_subfields.get(seg, set())
        if sub not in subfields:
            bad_runtime.append(f"{seg}.{sub}")
    if bad_runtime:
        print(f"❌ 技能 runtime.{sorted(bad_runtime)[:8]} 不在模板/TS（共 {len(bad_runtime)} 条）")
        fail += 1
    else:
        print(f"✓ 技能 runtime 引用全部命中模板 + TS")

    bad_workflow = []
    for seg, sub in skill_workflow:
        if not sub:
            continue
        if seg not in tpl_workflow:
            bad_workflow.append(f"{seg}.{sub}")
            continue
        subfields = ts_workflow_subfields.get(seg, set())
        if sub not in subfields:
            bad_workflow.append(f"{seg}.{sub}")
    if bad_workflow:
        print(f"❌ 技能 workflow.{sorted(bad_workflow)[:8]} 不在模板/TS（共 {len(bad_workflow)} 条）")
        fail += 1
    else:
        print(f"✓ 技能 workflow 引用全部命中模板 + TS")

    print("\n" + "=" * 60)
    if fail == 0:
        print("✅ 三方一致性校验全部通过")
        sys.exit(0)
    else:
        print(f"❌ 三方一致性校验发现 {fail} 处失配")
        sys.exit(1)


if __name__ == "__main__":
    main()