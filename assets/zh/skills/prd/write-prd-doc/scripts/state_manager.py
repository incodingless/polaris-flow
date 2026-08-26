#!/usr/bin/env python3
"""State manager for the prd-writer skill.

Handles per-requirement directory isolation, stage status tracking and
breakpoint (resume) detection. Each requirement lives in its own directory
under the configured workspace, with a `.prd-state.json` file recording the
generation stage of every step.

Stages (in execution order):
    clarify   - clarify the user story, consult the requirement library, ask the user
    draft     - design the product requirement draft and confirm with the user
    detail    - write detailed logic per feature (pre/post-conditions, data, etc.)
    review    - run the document review and produce a review report
    archive   - copy the final document to the configured archive location
    prototype - (optional) generate a prototype

Usage:
    python state_manager.py init    --workspace <dir> --title <t> --user-story <s> [--id <id>] [--library <dir>]
    python state_manager.py status  --dir <req-dir>
    python state_manager.py next    --dir <req-dir>
    python state_manager.py complete --dir <req-dir> --stage <name> [--outputs a,b,c] [--note <text>]
    python state_manager.py set     --dir <req-dir> --stage <name> --status <done|in_progress|pending|failed> [--note <text>]
    python state_manager.py reset   --dir <req-dir> --stage <name>
    python state_manager.py list    --workspace <dir>

All commands print machine-readable JSON to stdout unless noted otherwise.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

STAGES = ["clarify", "draft", "detail", "review", "archive", "prototype"]
DONE = "done"
IN_PROGRESS = "in_progress"
PENDING = "pending"
FAILED = "failed"
STATE_FILE = ".prd-state.json"


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slugify(text):
    s = text.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def _resolve_id(title, explicit_id=None):
    if explicit_id:
        return explicit_id.strip()
    slug = _slugify(title)
    if slug:
        return slug[:48]
    # Fall back to a short hash for non-latin titles (e.g. Chinese).
    import hashlib
    return "req-" + hashlib.md5(title.encode("utf-8")).hexdigest()[:8]


def cmd_init(args):
    workspace = os.path.abspath(args.workspace)
    os.makedirs(workspace, exist_ok=True)
    req_id = _resolve_id(args.title, args.id)
    req_dir = os.path.join(workspace, req_id)
    os.makedirs(req_dir, exist_ok=True)

    state = {
        "id": req_id,
        "title": args.title,
        "user_story": args.user_story,
        "requirement_library": os.path.abspath(args.library) if args.library else None,
        "current_stage": STAGES[0],
        "stages": {s: {"status": PENDING, "outputs": [], "note": "", "updated_at": None} for s in STAGES},
        "created_at": _now(),
        "updated_at": _now(),
    }
    # Persist original user story as a file for transparency.
    with open(os.path.join(req_dir, "user_story.md"), "w", encoding="utf-8") as f:
        f.write("# 用户故事\n\n")
        f.write(args.user_story.strip() + "\n")

    _write_state(req_dir, state)
    print(json.dumps({"requirement_dir": req_dir, "id": req_id, "created": True}))


def _read_state(req_dir):
    path = os.path.join(req_dir, STATE_FILE)
    if not os.path.isfile(path):
        raise SystemExit(json.dumps({"error": "state file not found: " + path}))
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write_state(req_dir, state):
    state["updated_at"] = _now()
    with open(os.path.join(req_dir, STATE_FILE), "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def cmd_status(args):
    state = _read_state(args.dir)
    print(json.dumps(state, ensure_ascii=False, indent=2))


def cmd_next(args):
    """Return the next stage to execute (first stage not yet DONE)."""
    state = _read_state(args.dir)
    for s in STAGES:
        if state["stages"].get(s, {}).get("status") != DONE:
            print(json.dumps({"next_stage": s, "current_stage": state.get("current_stage")}))
            return
    print(json.dumps({"next_stage": "DONE", "current_stage": state.get("current_stage")}))


def cmd_complete(args):
    state = _read_state(args.dir)
    stage = args.stage
    if stage not in STAGES:
        raise SystemExit(json.dumps({"error": "unknown stage: " + stage}))
    outputs = [o.strip() for o in (args.outputs or "").split(",") if o.strip()]
    rec = state["stages"][stage]
    rec["status"] = DONE
    rec["updated_at"] = _now()
    if outputs:
        rec["outputs"] = outputs
    if args.note:
        rec["note"] = args.note
    # Advance current_stage to the next not-done stage.
    nxt = "DONE"
    for s in STAGES:
        if state["stages"][s]["status"] != DONE:
            nxt = s
            break
    state["current_stage"] = nxt
    _write_state(args.dir, state)
    print(json.dumps({"stage": stage, "status": DONE, "next_stage": nxt}))


def cmd_set(args):
    state = _read_state(args.dir)
    stage = args.stage
    if stage not in STAGES:
        raise SystemExit(json.dumps({"error": "unknown stage: " + stage}))
    if args.status not in (DONE, IN_PROGRESS, PENDING, FAILED):
        raise SystemExit(json.dumps({"error": "invalid status: " + args.status}))
    rec = state["stages"][stage]
    rec["status"] = args.status
    rec["updated_at"] = _now()
    if args.note:
        rec["note"] = args.note
    if args.status == IN_PROGRESS:
        state["current_stage"] = stage
    _write_state(args.dir, state)
    print(json.dumps({"stage": stage, "status": args.status}))


def cmd_reset(args):
    """Mark a stage PENDING and invalidate every later stage (re-run cascades)."""
    state = _read_state(args.dir)
    stage = args.stage
    if stage not in STAGES:
        raise SystemExit(json.dumps({"error": "unknown stage: " + stage}))
    idx = STAGES.index(stage)
    for s in STAGES[idx:]:
        rec = state["stages"][s]
        rec["status"] = PENDING
        rec["updated_at"] = _now()
        # Keep outputs list but clear note so rework starts clean.
        rec["note"] = "reset at " + _now()
    state["current_stage"] = stage
    _write_state(args.dir, state)
    print(json.dumps({"reset_from": stage, "next_stage": stage}))


def cmd_list(args):
    workspace = os.path.abspath(args.workspace)
    if not os.path.isdir(workspace):
        print(json.dumps({"requirements": []}))
        return
    out = []
    for name in sorted(os.listdir(workspace)):
        req_dir = os.path.join(workspace, name)
        sp = os.path.join(req_dir, STATE_FILE)
        if os.path.isfile(sp):
            with open(sp, encoding="utf-8") as f:
                st = json.load(f)
            done = [s for s in STAGES if st["stages"][s]["status"] == DONE]
            out.append({
                "id": name,
                "title": st.get("title"),
                "current_stage": st.get("current_stage"),
                "done_stages": done,
                "updated_at": st.get("updated_at"),
            })
    print(json.dumps({"requirements": out}, ensure_ascii=False, indent=2))


def build_parser():
    p = argparse.ArgumentParser(description="prd-writer state manager")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("init", help="create a requirement directory + state file")
    pi.add_argument("--workspace", required=True, help="absolute workspace root (from config)")
    pi.add_argument("--title", required=True, help="requirement title")
    pi.add_argument("--user-story", required=True, help="the user story text")
    pi.add_argument("--id", help="explicit requirement id/slug (optional)")
    pi.add_argument("--library", help="requirement library path (optional)")
    pi.set_defaults(func=cmd_init)

    ps = sub.add_parser("status", help="print full state JSON")
    ps.add_argument("--dir", required=True)
    ps.set_defaults(func=cmd_status)

    pn = sub.add_parser("next", help="print the next stage to run")
    pn.add_argument("--dir", required=True)
    pn.set_defaults(func=cmd_next)

    pc = sub.add_parser("complete", help="mark a stage done and advance")
    pc.add_argument("--dir", required=True)
    pc.add_argument("--stage", required=True)
    pc.add_argument("--outputs", help="comma-separated output filenames")
    pc.add_argument("--note", help="optional note")
    pc.set_defaults(func=cmd_complete)

    pset = sub.add_parser("set", help="set a stage status")
    pset.add_argument("--dir", required=True)
    pset.add_argument("--stage", required=True)
    pset.add_argument("--status", required=True)
    pset.add_argument("--note", help="optional note")
    pset.set_defaults(func=cmd_set)

    pr = sub.add_parser("reset", help="reset a stage and later ones to pending")
    pr.add_argument("--dir", required=True)
    pr.add_argument("--stage", required=True)
    pr.set_defaults(func=cmd_reset)

    pl = sub.add_parser("list", help="list all requirements under a workspace")
    pl.add_argument("--workspace", required=True)
    pl.set_defaults(func=cmd_list)

    return p


if __name__ == "__main__":
    args = build_parser().parse_args()
    args.func(args)
