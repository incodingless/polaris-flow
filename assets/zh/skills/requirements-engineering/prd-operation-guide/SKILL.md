---
name: prd-operation-guide
description: >
  Use when the user says "写操作手册", "操作指引", "客服操作文档",
  "上线后的使用手册", or needs end-user documentation for a deployed feature.
  Optional skill for non-technical operator documentation.
---

# PRD Operation Guide

## Overview

"Follow-along" documentation for actual system operators. Configurable target audience. No technical details. Supports incremental updates.

## When to Use

- User says "写操作手册" or "客服操作文档"
- Feature deployed, need operator documentation
- Training materials for non-technical staff
- After PRD finalization or archiving

## Quick Reference

**Target Audience** (configure in Phase 0):

| Audience | Focus |
|:---|:---|
| Customer Support | Concise steps + exception handling + scripts |
| Operations | Data config + monitoring metrics |
| Business Admin | Permission settings + approval flows |
| Frontline Staff | Complete business process |

**9 Chapter Structure:**

| # | Chapter | Required |
|:---:|:---|:---:|
| 1 | Overview | Yes |
| 2 | Navigation Path | Yes |
| 3 | Operation Steps | Yes |
| 4 | Key Rules | Yes |
| 5 | State Transitions | Yes |
| 6 | Exception Handling | Yes |
| 7 | User Scripts | Support only |
| 8 | Metrics | Ops/Admin only |
| 9 | Version History | Yes |

**Output**: `guides/operation-guide-v{N}.md`

**Full templates**: See [templates/operation-guide-templates.md](templates/operation-guide-templates.md)

## Implementation

### Hard Rules

- Must read PRD (final preferred, draft acceptable)
- **No technical details**: no API names, table names, SQL, code logic
- Button/field names match PRD, marked with **【】**
- Key rules must use tables, not prose
- Navigation path: System > Level-1 Menu > Level-2 Menu
- State transitions must be closed loop (all states + all actions)

### Incremental Update Mode

When existing guide found:
1. Read previous version
2. Diff against current PRD → detect added/modified/deleted sections
3. Present diff list → user selects
4. Generate v{N+1} with only changed sections updated

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Including API names, table names, SQL | Strictly no technical details |
| 2 | Button names inconsistent with PRD | Use 【】 and match PRD exactly |
| 3 | Key rules in prose | Must use tables |
| 4 | Incomplete state transitions | Closed loop: all states + actions |
| 5 | Vague navigation path | Full path: system > menu > submenu |
| 6 | Generic exception handling | Specific: error message + trigger + fix |
| 7 | Not configuring target audience | Phase 0 must confirm audience |
| 8 | Incremental without version diff | Must diff against previous version |
