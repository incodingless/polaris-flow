---
name: prd-prototype
description: >
  Use when the user says "生成原型", "做个 HTML 原型", "画一下页面",
  "原型验证一下交互", or wants to validate interaction design before development.
  Optional skill for interactive prototype generation and iteration.
---

# PRD Prototype

## Overview

Three-phase closed loop: interaction evaluation → single-file HTML prototype → feedback back to requirements. Prototype must be a standalone HTML file with zero external dependencies.

## When to Use

- User says "生成原型" or "做个 HTML 原型"
- Need to validate interaction design before development
- Want to discover interaction issues early
- After PRD draft/final, before development

## Quick Reference

| Phase | Action | Output |
|:---:|:---|:---|
| 1 | Interaction design evaluation | ≥1 improvement suggestion |
| 2 | Generate HTML prototype | `prototypes/prototype-v{N}.html` |
| 3 | Feedback → update requirements | Via `prd-update` |

**HTML Constraints:**

| Item | Rule |
|:---|:---|
| Files | Single HTML only |
| Dependencies | Zero (no CDN, no external CSS/JS) |
| Resources | CSS in `<style>`, JS in `<script>` |
| Data | Mock data inline (arrays in JS) |
| Interaction | Real clickable (buttons, forms, tabs) |
| Storage | Memory variables only (no localStorage) |

**Coverage Requirements:**

| PRD Section | Prototype Must Show |
|:---|:---|
| §2 Main flow | Key steps have corresponding pages |
| §3 Capabilities | List/form/detail/exception states |
| §3 Scenarios | ≥1 complete end-to-end walkthrough |
| §3 Exceptions | ≥1 exception state (e.g. "no permission") |

## Implementation

### Phase 1: Generate Prototype

1. **Interaction evaluation**: Propose ≥1 improvement after reading PRD
2. **User selects**: Adopt all / partial / none / custom
3. **Generate HTML**: Single file, inline everything, mock data

### Phase 2: Confirm Feedback

- User previews in browser
- A. Prototype OK → done
- B. Found issues → classify: affects Discovery? If yes, `prd-update` L2
- C. Prototype needs change → regenerate v{N+1}

### Phase 3: Update Requirements

Convert feedback to `prd-update` input. Route through full change management.

## Common Mistakes

| # | Anti-pattern | Correct Approach |
|:---:|:---|:---|
| 1 | Skipping interaction evaluation | Phase 1 step 1 is mandatory |
| 2 | Using CDN UI frameworks | Single file + inline resources |
| 3 | Using localStorage | Memory variables only |
| 4 | Static images only | Must be really clickable |
| 5 | Feedback not flowing back to PRD | Phase 3 calls `prd-update` |
| 6 | Editing PRD directly from feedback | Must route through `prd-update` |
| 7 | No exception state | At least 1 exception page |
