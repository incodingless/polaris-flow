---
name: prd-prototype
description: >
  Deprecated pointer holding no independent content; selected only when `prd-workflow` routes
  here to reach the Prototype stage. Prototype construction is owned by
  polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate and delivery judgement by
  polaris{{SKN_SPR}}prototype{{SKN_SPR}}review; route any end-user prototype request there
  instead. No user-facing trigger of its own.
---

# prd-prototype · Deprecated pointer

> **This skill has no content of its own.** Everything it used to do now lives in
> `polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate` (9 stages · 6+1 deliverables · gate at stage 9.3)
> and `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review` (pass/fail judgement).
> This file exists only so that `prd-workflow`'s Prototype stage does not route into nothing.

## Why this shell is kept rather than deleted

`prd-workflow`'s stage matrix includes a **Prototype** stage reachable from Draft / Final / Reviewed.
Deleting this directory would leave that route pointing at a missing skill. Keeping a shell that
carries **zero duplicated specification** is the cheapest way to keep the old family intact while
removing the duplicate source of truth.

## Routing table

| Intent | Go to |
|:---|:---|
| Build a prototype from a requirement doc | `polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate` |
| Judge whether an existing prototype is deliverable | `polaris{{SKN_SPR}}prototype{{SKN_SPR}}review` |
| Low-fidelity wireframe only | `lofi-prototype` |
| Feed prototype findings back into the PRD | `prd-update` (this family — see below) |

## Where the old capabilities went

| Old (`prd-prototype`) | Now |
|:---|:---|
| Phase 1 interaction evaluation, ≥1 improvement | Stages 1–8 (judgement layer) of the target skill; 6 artifacts written to disk |
| Phase 2 single-file HTML: zero deps, inline resources, mock data, genuinely clickable | Stage 9.1 + `scaffold.mjs`; constraints machine-enforced by `verify.mjs` (single file / no external refs / `<section id>` / `data-goto`) |
| ≥1 exception state, ≥1 end-to-end walkthrough | Stage 7 (11 states) + 9.2 three-layer verification incl. golden-flow path test |
| Phase 3 feedback back into requirements via `prd-update` L2 | **Still owned by this family** — see below |

## ⚠️ The one thing the new skill deliberately does NOT do

`polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate` explicitly refuses to rewrite requirements
(findings are reported back to the product manager, then stop). So the closed loop that used to
live in old Phase 3 — *prototype finding → PRD change proposal* — has **no home in the new skill**.

Do the loop here, in this family:

1. Prototype finding touches **requirements content** → route through `prd-update` L2
   (artifact: `changes/change-suggestion-v{N}.md`).
2. Finding touches **the prototype itself** → back to `polaris{{SKN_SPR}}prototype{{SKN_SPR}}generate`.

Do **not** edit the PRD directly on the strength of a prototype finding — that bypasses change
management and was old mistake #6.

## Naming note

`name` stays `prd-prototype` on purpose: it breaks the `polaris{{SKN_SPR}}` convention, but
renaming it alone would desynchronise this whole family (all 11 skills here share the plain
`prd-*` form) and `prd-workflow` routes by these names. Fixing the convention is a family-wide
decision, not a local one.
