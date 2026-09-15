---
name: prd-update
description: >
  Use when the user says "修改需求", "调整 PRD", "评审反馈要加一个功能",
  "把参数 X 改成 Y", or needs to apply review/testability report fixes.
  Triggers for any post-creation modification to Discovery or PRD.
---

# PRD Update

## Overview

Closed-loop change management for requirements. Two levels (L1 tweak / L2 standard), two targets (draft / final). Always syncs Discovery. Auto-scans ripple effects.

## When to Use

- User says "修改需求" or "调整 PRD"
- Applying review report fixes
- Applying testability report fixes
- Applying prototype feedback changes
- Any post-creation requirement modification

## Quick Reference

| Level | Trigger | Path | Discovery Sync |
|:---:|:---|:---|:---:|
| L1 Tweak | Change 1-2 params / adjust text | Summary → change list → confirm → edit → self-check | Patch affected sections |
| L2 Standard | New feature / role / flow / cross-module / core BR change | Full 3-phase (proposal → Discovery update → PRD finalize) | Full regeneration |

| Target | Behavior |
|:---|:---|
| Draft only | Update draft |
| Final exists | Update final; sync to draft if core chapters changed |
| Both | Draft first, then final |

**Output**: Updated `{req}-discovery-v{N+1}.md`, `{req}-draft/final-v{N+1}.md`, `changes/change-suggestion-v{N+1}.md`

## Implementation

### Phase 0: Level + Target Detection

1. Locate Discovery and PRD (latest versions)
2. Detect change level from user description
3. Detect target (draft / final / both)

### Phase 1: Change Proposal

1. **Understanding summary**: Restate user's intent for confirmation
2. **Change execution list**: Every change location (Discovery + PRD)
3. **Ripple scan**: Auto-detect linked locations by change type
4. **User confirmation**: Which ripple effects to include

### Phase 2: Update Discovery

- L1: Patch affected sections only, version +1
- L2: Re-run required questions, regenerate full Discovery, version +1

### Phase 3: Update PRD

- Apply changes to target
- L2: Confirm chapter by chapter
- Self-check: bidirectional consistency, all changes applied, version +1, change file persisted

### Review-Driven Fix Mode

When user says "按评审报告修复":
1. Read `reviews/review-report-v{N}.md`
2. Extract all 🔴 blockers as change proposals
3. Auto-level each (🔴 → usually L2)
4. Batch generate change list, user confirms once
5. Apply → call `prd-review` for closure report

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Not detecting change level first | Phase 0 must determine level |
| 2 | Editing PRD without syncing Discovery | Force sync both directions |
| 3 | Skipping ripple scan | Must read position mapping |
| 4 | No change execution list | All changes need a list first |
| 5 | L2 without chapter confirmation | L2 must confirm per chapter |
| 6 | Not updating mapping table after change | Self-check includes rescan |
| 7 | Forgetting version +1 | Version must increment |
| 8 | Change proposal not persisted | Save to `changes/` |
