---
name: prd-review
description: >
  Use when the user says "评审需求", "检查 PRD 完整性", "看看需求有什么问题",
  "PRD 评审一下", or needs to validate a PRD before development. Triggers on any
  request to review or check PRD quality and completeness.
---

# PRD Review

## Overview

9-dimension completeness check + Discovery↔PRD bidirectional consistency. Outputs 🔴/🟡/🔵 classified report. Does NOT edit PRD — drives fixes via `prd-update`.

## When to Use

- User says "评审需求" or "检查 PRD 完整性"
- Before development handoff
- After significant PRD updates
- When user asks "看看需求有什么问题"

## Quick Reference

| Dim | Name | Blocker Checks |
|:---:|:---|:---|
| 1 | Background | Source clear, target users defined |
| 2 | Value | Quantified goals present |
| 3 | Feature List | Completeness vs draft §3 |
| 4 | Business Flow | Main flow complete, ≥3 exceptions |
| 5 | Data Model | Covers all draft I/O |
| 6 | Requirement Details | BR references, exceptions per capability, I/O defined, anchors valid |
| 7 | Cross-Module | API prefix matches conventions, response structure, error codes |
| 8 | System Conflict | No naming/API/BR/role conflicts |
| 9 | Discovery↔PRD | Scope, roles, flows, metrics, rules all mapped bidirectionally |
| 10 | AI Readability | Anchor stability, term consistency, semantic clarity, structure compliance |

**Output**: `reviews/review-report-v{N}.md`

**Severity**: 🔴 Block / 🟡 Suggest / 🔵 Note

## Implementation

### Phase 0: Load Discovery + PRD

1. Locate Discovery and PRD (final preferred, draft fallback)
2. Auto-run position mapping scan if missing
3. Determine review scope (all chapters or user-specified)

### Phase 1: Silent Check (All Dimensions)

Execute all 10 dimensions silently. No user interruption.

### Phase 2: Report Output

Report structure:
- Summary table: problems per dimension by severity
- 🔴 Blockers (must fix before dev)
- 🟡 Suggestions (should fix or agree default)
- 🔵 Notes (fix when time allows)
- Fix path: recommend `prd-update` level for each severity

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Editing PRD during review | Report only; `prd-update` fixes |
| 2 | Marking style issues as 🔴 | Strict 🔴/🟡/🔵 criteria |
| 3 | Merging problems by dimension | Group by 10 dimensions + bidirectional check |
| 4 | Not pointing to specific PRD locations | Every problem cites `§X.Y paragraph N` |
| 5 | Skipping Discovery bidirectional check | Must check both directions |
| 6 | Not persisting report | Save to `reviews/review-report-v{N}.md` |
| 7 | Only checking Discovery→PRD | Must check PRD→Discovery too |
