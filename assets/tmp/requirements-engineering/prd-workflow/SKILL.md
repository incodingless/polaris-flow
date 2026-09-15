---
name: prd-workflow
description: >
  Use when the user wants to work on product requirements, write PRD, continue an existing requirement,
  or says things like "写需求", "做PRD", "继续上次的需求", "看看需求到哪一步了".
  Triggers on any PRD-related request where the current stage is unknown.
---

# PRD Workflow

## Overview

Single entry point for the PRD lifecycle. Detects current stage automatically and routes to the right sub-skill.

## When to Use

- User says "写需求", "做PRD", "需求文档" without specifying a stage
- User says "继续上次的需求" or "看看需求到哪一步了"
- User wants to list all ongoing requirements
- Any PRD-related request where the current stage is unclear

## Quick Reference

| Stage | Artifacts Present | Recommended | Alternatives |
|:---|:---|:---|:---|
| New | None | Start discovery | — |
| Discovery | Discovery only | Draft PRD | Refine discovery |
| Draft | Discovery + Draft | Finalize PRD | Review / Prototype |
| Final | All docs | Review | Testability / Prototype / Update |
| Reviewed | + Review report | Fix issues | Re-review / Prototype |
| Prototyped | + Prototype | Update from feedback | Re-prototype |
| Archived | + Archive log | Operation guide | Re-activate |

**Shortcuts for power users:**

| Command | Routes to |
|:---|:---|
| `{req}, start` | prd-discovery |
| `{req}, draft` | prd-draft |
| `{req}, finalize` | prd-final |
| `{req}, review` | prd-review |
| `{req}, update {desc}` | prd-update |
| `{req}, archive` | prd-archive |

## Implementation

### Phase 0: Silent State Scan

1. Parse requirement name from user input
2. Scan `<prdRoot>/{req}/` for artifacts (Discovery, Draft, Final, Review, Prototype, Archive)
3. Check `sessions/` for interrupted sessions — highest priority prompt
4. If interrupted session found → prompt to resume or restart

### Phase 1: Stage Detection + Option Presentation

Use the Quick Reference stage matrix. Present one recommended action (🟢) + up to 4 alternatives.

### Phase 2: Route to Sub-Skill

Map user selection to target skill, auto-injecting requirement name, current stage, and latest artifact paths.

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Sub-skills doing their own state detection | Shell does unified detection; sub-skills only execute |
| 2 | Presenting >5 options | Max 1 recommended + 4 alternatives |
| 3 | Not checking interrupted sessions | Phase 0 must scan `sessions/*.json` first |
| 4 | Shell generating artifacts | Shell only routes; sub-skills generate |
| 5 | Not passing context to sub-skills | Auto-inject req name, stage, artifact paths |
