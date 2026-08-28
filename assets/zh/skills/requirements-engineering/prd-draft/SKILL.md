---
name: prd-draft
description: >
  Use when the user says "写 PRD 初稿", "帮我写需求文档初稿", "基于 Discovery 写需求",
  or has a confirmed Discovery document ready for PRD drafting. Triggers after prd-discovery
  completes and the user wants to start writing the PRD draft.
---

# PRD Draft

## Overview

Generate PRD draft from confirmed Discovery. Discovery is the sole input — no Discovery, no draft. 7 lightweight chapters focused on requirement logic iteration.

## When to Use

- User says "写 PRD 初稿" or "基于 Discovery 写需求"
- Discovery document exists and is confirmed
- Starting PRD writing after discovery phase

## Quick Reference

| # | Chapter | Source | Key Content |
|:---:|:---|:---|:---|
| 0 | Capability Architecture | Discovery | Capability layer + scenario layer + reuse graph |
| 1 | Background | Discovery scope, roles, metrics | Source, users, value |
| 2 | Business Flow | Discovery core flows | Flowchart + sequence + exceptions |
| 3 | Requirement Details | Discovery | Capability layer + scenario layer + entity recognition |
| 4 | Version Record | — | Author, date |
| 5 | Update Record | — | Change summary |
| 6 | Acceptance Criteria | Discovery metrics + scope | Quantifiable conditions per feature |

**Output**: `{req}-draft-v{N}.md`

**Full templates**: See [templates/draft-templates.md](templates/draft-templates.md)

## Implementation

### Hard Rules

- No Discovery → refuse, prompt to run `prd-discovery` first
- Confirm chapter by chapter: output draft → user confirms → save to `sessions/` → next chapter
- Chapter 3 organized by "capability layer + scenario layer"
- Capability anchors `GC-NNN`; scenario anchors `SC-NNN`
- **Forbidden**: API contracts, data models, permission management

### Self-Check (After All Chapters)

- [ ] Every chapter maps to Discovery content (no orphans)
- [ ] Capabilities and scenarios have clear reuse relationships
- [ ] Entities match Discovery roles/flows
- [ ] Every P0 acceptance criterion has quantifiable verification
- [ ] Every `GC-NNN` referenced at least once in scenarios
- [ ] Product language throughout (no class/table/API names)
- [ ] Exceptions cover all Discovery exception scenarios

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Writing PRD without Discovery | Hard constraint: refuse without Discovery |
| 2 | Draft generating API contracts | Draft = 7 chapters only; contracts in final |
| 3 | Re-describing capabilities per scenario | Describe once, reference by `GC-NNN` |
| 4 | Flowcharts with API paths / class names | Use product language |
| 5 | Outputting full text without chapter confirmation | Confirm per chapter |
| 6 | Not saving after confirmation | Write to `sessions/draft_confirmed_sections.json` |
| 7 | Business rules without Discovery rule IDs | Keep BR numbers for bidirectional checks |
| 8 | Chapter 3 missing exception handling | Every capability must have exception table |
