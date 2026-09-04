---
name: prd-final
description: >
  Use when the user says "生成 PRD 终稿", "补全需求文档", "输出完整 PRD",
  or needs API contracts and data models added to an existing draft. Triggers when
  the draft is stable and the user wants the complete 14-chapter PRD.
---

# PRD Final

## Overview

Complete the PRD by adding all delivery chapters in one batch. Inherits draft chapters, only appends. Runs self-check on acceptance criteria compliance before output.

## When to Use

- User says "生成 PRD 终稿" or "需要接口契约和数据模型"
- Draft exists and is confirmed
- Need complete PRD with technical details for development

## Quick Reference

| # | Chapter | Type |
|:---:|:---|:---:|
| 1-6 | Inherited from draft | — |
| 2 | Value | New |
| 3 | Feature List | New |
| 4 | System Architecture | New |
| 7 | API Contracts | New |
| 8 | Data Model | New |
| 9 | Permissions | New |
| 10 | Metrics | New |
| 11 | Open Items | New |
| 12 | Default Assumptions | New |

**Output**: `{req}-final-v{N}.md`

**Full templates**: See [templates/final-templates.md](templates/final-templates.md)

## Implementation

### Hard Rules

- No draft → refuse, prompt to run `prd-draft` first
- Only append chapters; never modify inherited draft content
- Use batch confirmation (1 round) for all appended chapters
- API contracts and data models require L2 validation (syntax check)

### Self-Check

| Check | Rule |
|:---|:---|
| Feature list completeness | Every draft §3 capability/scenario has a feature |
| API contract syntax | Validate JSON syntax and field types |
| Data model consistency | Model fields cover all draft §3 inputs/outputs |
| Permission matrix | All roles × all operations covered |
| Exception responses | Every API has corresponding error codes |
| Draft inheritance | Draft chapters copied completely, no omissions |

### Acceptance Criteria Compliance Check

After final generation, auto-check: every draft acceptance criterion → is it satisfied in final? Unsatisfied items → add to §11 Open Items.

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Generating final without draft | Must have draft first |
| 2 | Modifying inherited draft chapters | Final appends only, never rewrites |
| 3 | API contracts without L2 validation | Validate JSON and field types |
| 4 | Data model missing draft input/output fields | Model must cover all draft I/O |
| 5 | Permission matrix missing role or operation | Matrix must be complete |
| 6 | Self-check skipped | Check before persisting |
| 7 | Default assumptions not listed | All AI-inferred defaults must be explicit |
