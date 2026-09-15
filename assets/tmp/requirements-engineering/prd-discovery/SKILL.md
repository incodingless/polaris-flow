---
name: prd-discovery
description: >
  Use when the user wants to write a product requirement, clarify scope, brainstorm features,
  or says things like "帮我写个需求", "需求还没想清楚", "想梳理一下需求", "头脑风暴一下需求".
  Triggers on vague requirement requests before any PRD drafting begins.
---

# PRD Discovery

## Overview

Discover and align on requirement scope before writing. Thinking separated from writing. Outputs a confirmed Discovery document — the single input source for all downstream PRD skills.

## When to Use

- User has a vague idea: "我想做个..."
- User wants to brainstorm or clarify scope
- Starting any new requirement (always begin here)
- Updating scope of an existing requirement (Level 2 change)

## Quick Reference

| Phase | Action | User Interaction |
|:---:|:---|:---|
| 0 | Check for interrupted sessions | Silent |
| 1 | Explore project context | Silent |
| 2 | Infer module, roles, flows | Silent |
| 3 | Clarify (max 5 rounds) | 1 question, 2-4 options per round |
| 4 | Present candidate solutions (if needed) | Choose A/B/C |
| 4.5 | Confirm capability architecture (≥⭐⭐⭐) | Review + confirm |
| 5 | Generate Discovery document | Review + confirm |

**6 Required Questions:**

| # | Topic | Priority |
|:---:|:---|:---:|
| 1 | Name + module | P0 |
| 2 | Scope (include/exclude) | P0 |
| 3 | Roles + permissions | P0 |
| 4 | Core flows | P1 |
| 5 | Metrics / validation | P1 |
| 6 | Exceptions / constraints | P2 |

**Output**: `{req}-discovery-v{N}.md` → `<prdRoot>/{req}/`

**Full templates**: See [templates/discovery-templates.md](templates/discovery-templates.md)

## Implementation

### Hard Rules

- Phases 0-2 run silently (no user interruption)
- Phase 3: 1 question per round, 2-4 options, 1 recommended (🟢)
- Max 5 rounds; simple needs finish in 2-3
- No PRD-level details (API names, table names) in Discovery
- Complexity < ⭐⭐ skips Phase 4.5 (capability architecture)

### Enhanced Modules

Auto-triggered by complexity: Brainstorm (Phase 1), Hidden Needs scan (Phase 2), User Stories (Phase 3).

### Mandatory Human Review

Before finalization, PM must confirm: read document, scope accurate, priorities reasonable, hidden needs addressed, replies "confirmed".

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Asking multiple questions at once | 1 question per round |
| 2 | Skipping module identification | Q1 must confirm module |
| 3 | No options for open-ended answers | Always provide 2-4 options |
| 4 | Not tracking completed questions | Save to `sessions/discovery-confirmed-sections.json` |
| 5 | Mixing "thinking" and "writing" | Discovery confirms rules/scope; no interface details |
| 6 | Forcing architecture on simple needs | ⭐⭐ or below skips Phase 4.5 |
| 7 | Not confirming excluded items | Q2 must explicitly list "excluded" |
