#!/usr/bin/env python3
"""Configuration loader for the prd-writer skill.

Loads the skill configuration file (YAML or JSON) and resolves the document
generation location (`workspace`) and the archive location (`archive`). Paths
may be given relative to the config file and are resolved to absolute form.

The loader is dependency-free: it uses PyYAML when available, otherwise a
minimal flat-key parser that handles the simple `key: value` config used by
this skill (comments with `#`, quoted/plain strings, booleans and numbers).

Usage:
    python config_manager.py load --config <path> [--no-create]
    python config_manager.py find [--start <dir>]

`find` searches for prd-config.yaml / prd-config.json from the start dir upward.
"""

import argparse
import json
import os
import sys

REQUIRED_KEYS = ("workspace", "archive")
OPTIONAL_KEYS = {
    "requirement_library": None,
    "language": "zh-CN",
    "generate_prototype": False,
    "prototype_format": "html",
    "config_version": 1,
}


def _minimal_yaml(text):
    """Parse a flat key: value YAML into a dict (no nesting)."""
    data = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # Strip an inline comment that is preceded by whitespace.
        hash_idx = line.find("#")
        if hash_idx > 0 and line[hash_idx - 1] in (" ", "\t"):
            line = line[:hash_idx].strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if not key:
            continue
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        elif val.lower() in ("true", "false"):
            val = val.lower() == "true"
        elif val.lower() in ("null", "none", ""):
            val = None
        else:
            try:
                val = int(val)
            except ValueError:
                try:
                    val = float(val)
                except ValueError:
                    pass
        data[key] = val
    return data


def load_config(path):
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise SystemExit(json.dumps({"error": "config file not found: " + path}))
    with open(path, encoding="utf-8") as f:
        text = f.read()
    cfg_dir = os.path.dirname(path)

    if path.endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise SystemExit(json.dumps({"error": "invalid JSON config: " + str(e)}))
    else:
        try:
            import yaml  # type: ignore
            data = yaml.safe_load(text) or {}
        except ImportError:
            data = _minimal_yaml(text)

    if not isinstance(data, dict):
        raise SystemExit(json.dumps({"error": "config root must be a mapping"}))

    # Apply defaults for optional keys.
    for k, default in OPTIONAL_KEYS.items():
        data.setdefault(k, default)

    # Validate required keys.
    missing = [k for k in REQUIRED_KEYS if not data.get(k)]
    if missing:
        raise SystemExit(json.dumps({"error": "missing required config keys: " + ", ".join(missing)}))

    # Resolve paths relative to the config file directory.
    def resolve(p):
        if p is None:
            return None
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(cfg_dir, p))

    data["workspace"] = resolve(data["workspace"])
    data["archive"] = resolve(data["archive"])
    data["requirement_library"] = resolve(data["requirement_library"])
    data["_config_path"] = path

    # Report existence (do not fail if missing; creation is the caller's choice).
    data["_workspace_exists"] = os.path.isdir(data["workspace"])
    data["_archive_exists"] = os.path.isdir(data["archive"])
    return data


def cmd_load(args):
    data = load_config(args.config)
    if not args.no_create:
        for key in ("workspace", "archive"):
            d = data[key]
            if d and not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
        data["_workspace_exists"] = os.path.isdir(data["workspace"])
        data["_archive_exists"] = os.path.isdir(data["archive"])
    print(json.dumps(data, ensure_ascii=False, indent=2))


def cmd_find(args):
    start = os.path.abspath(args.start or os.getcwd())
    names = ("prd-config.yaml", "prd-config.yml", "prd-config.json")
    cur = start
    found = None
    while True:
        for n in names:
            cand = os.path.join(cur, n)
            if os.path.isfile(cand):
                found = cand
                break
        if found:
            break
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    if found:
        print(json.dumps({"config": found}))
    else:
        print(json.dumps({"config": None, "searched_from": start}))


def build_parser():
    p = argparse.ArgumentParser(description="prd-writer config manager")
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("load", help="load and resolve a config file")
    pl.add_argument("--config", required=True)
    pl.add_argument("--no-create", action="store_true", help="do not create missing dirs")
    pl.set_defaults(func=cmd_load)

    pf = sub.add_parser("find", help="search upward for a config file")
    pf.add_argument("--start", help="directory to start searching from")
    pf.set_defaults(func=cmd_find)
    return p


if __name__ == "__main__":
    args = build_parser().parse_args()
    args.func(args)
