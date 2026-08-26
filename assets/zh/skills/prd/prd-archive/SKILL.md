---
name: prd-archive
description: >
  Use when the user says "需求上线了", "功能已发布", "归档需求",
  "同步到知识库", "更新术语表", or a requirement has been deployed and
  needs to be synced back to the knowledge base. Triggers at the end of the
  requirement lifecycle.
---

# PRD Archive

## Overview

Incremental archive to knowledge base after deployment. Extracts business terms, updates KB index. Appends to existing files only — never creates new ones.

## When to Use

- User says "需求上线了" or "功能已发布"
- Requirement deployed, needs knowledge base sync
- User says "归档需求" or "更新术语表"
- End of requirement lifecycle

## Quick Reference

| Phase | Action | Key Rule |
|:---:|:---|:---|
| 0 | Parse input | Deployment notes override PRD if provided |
| 1 | Identify affected KB files | 7 file types scanned |
| 2 | Generate incremental update proposal | User confirms each item |
| 3 | Apply updates + output log | Backup before each change |

**KB Files Updated:**

| File | What |
|:---|:---|
| `business/modules/{m}/scenarios.md` | Append new scenarios |
| `backend/modules/{m}/index.md` | Append domains, update AI quick ref |
| `backend/modules/{m}/business_rules.md` | Append BRs, mark deprecated |
| `backend/modules/{m}/{NN}-domain.md` | Append/modify sections |
| `backend/common/business_domain.md` | Append new entities |
| `backend/common/state_machines.md` | Append new state machines |
| `contract/conventions.md` | Append new error codes |

**Output**: `sessions/archive-log-v{N}.md`

## Implementation

### Hard Rules

- Deployment notes override PRD (reality > plan)
- Only update existing files, never create new ones
- Every update requires user confirmation
- Deprecated BRs marked, never deleted
- Backup to `sessions/kb-backup-v{N}/` before each change

### Terminology Extraction

Auto-extract business terms from PRD, compare with `<kbRoot>/global/terminology.md`:
- New terms → append
- Synonyms → suggest unification
- Conflicts → flag for user decision

### Self-Check

- [ ] `terminology.md` updated, no syntax errors
- [ ] `knowledge-base-index.md` format correct
- [ ] All modified files backed up
- [ ] `archive-log-v{N}.md` persisted with full summary
- [ ] No duplicate BRs or scenarios

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|:---|
| 1 | Creating new files vs appending | Only update existing files |
| 2 | Not checking for duplicates | Phase 1 must check for existing content |
| 3 | Modifying without user confirmation | Phase 2 must present proposal |
| 4 | No change log | Phase 3 must output log |
| 5 | Treating PRD and deployment notes equally | Deployment notes override PRD |
| 6 | Deleting deprecated BRs | Mark deprecated, never delete |
| 7 | Updating multiple requirements at once | One archive per requirement |
| 8 | Not updating index.md AI quick ref | index.md is AI entry point, must sync |
