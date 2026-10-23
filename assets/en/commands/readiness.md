---
name: readiness
command_prefix: polaris
triggers: ["/polaris{{CMD_SPR}}readiness"]
description: Requirement readiness assessment (R&D go/no-go: five-dimension weighted scoring + PASS/CONDITIONAL/FAIL)
---

> **Prerequisite**: the assessment target MUST be the **finalized PRD** (`prd-final-v1.0.md`). If no finalized PRD exists, run `/polaris{{CMD_SPR}}flow` → **R02** first.
> Missing prior review / testability reports do NOT block — the affected dimensions are marked "insufficient evidence" and capped at 3 points.

Use the `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness` skill.

This command is the standalone entry point for the go/no-go assessment normally invoked by `polaris{{SKN_SPR}}prd{{SKN_SPR}}ship` Step 1, including the waiver check (E1–E3) and mandatory signals (F1–F5). Assessment only — it never modifies the document.
