---
name: prd-conventions
description: >
  Use when any prd-* skill needs to reference directory structure, naming conventions,
  chapter format, change management, or Discovery document format. Also triggers when
  the user asks "PRD规范", "需求文档目录", "PRD章节标准".
---

# PRD Conventions

## Overview

Shared specification ("constitution") for all PRD skills. Defines conventions once; all skills reference §N instead of copying.

## When to Use

- Writing or editing any prd-* skill and need to reference a convention
- User asks about PRD directory structure, naming, or chapter standards
- Need to initialize PRD system configuration

## Quick Reference

| § | Topic | Key Rule |
|:---:|:---|:---|
| §1 | Chapter Structure | Draft: 7 chapters (0-6). Final: 14 chapters |
| §2 | Directory Layout | `<prdRoot>/{req}/` with sessions/, reviews/, changes/ |
| §3 | Naming | `GC-NNN` for capabilities, `SC-NNN` for scenarios |
| §4 | Discovery Format | Must include scope, roles, flows, metrics |
| §5 | Change Levels | L1 (tweak) vs L2 (standard) based on impact |
| §6 | Ripple Scan | Changes to rules/states/roles must scan linked sections |
| §7 | Confirm-by-Chapter | Long skills (discovery, draft, update L2) confirm per chapter |
| §8 | Session Recovery | Save to `sessions/*.json` after each confirmed chapter |
| §9 | Product Language | No class names, table names, or API paths in §3 |
| §10 | Severity Levels | 🔴 Block / 🟡 Suggest / 🔵 Note |
| §11 | Init Config | Store in `<project>/.trae/prd-config.md` |

**Full specification**: See [reference/conventions-full.md](reference/conventions-full.md)

## Implementation

### Passive Loading

Other skills load this skill during Phase 0 (knowledge base setup) and reference `prd-conventions §N` inline.

### Direct Use

When user triggers directly, return the § index above and ask which section to display.

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Copying convention text into other skills | Reference `prd-conventions §N` |
| 2 | Draft generating API contracts | Draft only 7 chapters; contracts in final |
| 3 | Editing PRD without updating Discovery | Always sync both directions |
| 4 | Re-describing capabilities in every scenario | Describe once, reference by `GC-NNN` |
| 5 | Using different severity scales | All skills use 🔴/🟡/🔵 |
| 6 | Long skills without session recovery | Write to `sessions/*.json` per chapter |
| 7 | Product language with code details | Use product terms; code only in §7/§8 |
