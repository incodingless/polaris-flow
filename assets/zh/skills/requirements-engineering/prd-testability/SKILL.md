---
name: prd-testability
description: >
  Use when the user says "检查需求可测性", "测试能不能写用例", "评审需求测试性",
  "QA 视角看需求", or needs to assess whether a PRD can be turned into test cases.
  Triggers after PRD finalization and before development handoff.
---

# PRD Testability

## Overview

Check whether PRD can be converted to test cases. Standards and process are separated — standards are replaceable. Drives fixes via `prd-update`, not just a report.

## When to Use

- User asks "检查需求可测性" or "测试能不能写用例"
- Before QA test case writing
- After PRD finalization, before development handoff
- When user wants a QA perspective on requirements

## Quick Reference

| # | Check | Severity | What |
|:---:|:---|:---:|:---|
| 1 | Acceptance criteria clear | 🔴 | Quantifiable per feature (e.g. "list load ≤ 3s") |
| 2 | Input boundaries complete | 🔴 | Required/optional, length/range, special chars |
| 3 | Output assertable | 🔴 | Expected value or format defined |
| 4 | Exception scenarios listed | 🔴 | Cover permission/missing data/network/concurrency |
| 5 | State transitions closed | 🟡 | All states have source/destination |
| 6 | API request examples | 🟡 | Request/response examples in §7 |
| 7 | Data model constraints | 🟡 | Type, length, required, default per field |
| 8 | Permission matrix complete | 🟡 | No blank cells in role × operation |
| 9 | Business rules numbered | 🔵 | BR number or Discovery rule ID per rule |
| 10 | Flowchart naming | 🔵 | Business terms, not step1/node2 |

**Output**: `reviews/testability-report-v{N}.md`
**Score**: 0-10 (≥8 high, 6-8 medium, <6 low)

**Custom standards**: Define in `<kbRoot>/standards/testability-checklist.md`

**Full templates**: See [templates/testability-templates.md](templates/testability-templates.md)

## Implementation

### Scenario 1: Testability Review

**Phase 0**: Load PRD (final preferred) + check standards file
**Phase 1**: Silent scan of all 10 checks against PRD sections
**Phase 2**: Output report with score and 🔴/🟡/🔵 classified fixes

### Scenario 2: Apply Fixes from Report

**Phase 0**: Read latest testability report
**Phase 1**: Present fix list, user selects which to adopt
**Phase 2**: Route to `prd-update` with selected fixes

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Report only, no fix path | Provide scenario two to auto-drive update |
| 2 | Standards hardcoded in skill | Externalize to `standards/` directory |
| 3 | Not distinguishing 🔴/🟡/🔵 | Strict grading |
| 4 | Marking "not detailed enough" as 🔴 | 🔴 only for "cannot write test cases" |
| 5 | No score output | Always output 0-10 score |
| 6 | Editing PRD directly | Route through `prd-update` |
| 7 | Not citing PRD location | Every fix cites §X.Y |
