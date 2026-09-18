# Init Wizard UX Improvements Design

## Overview

Three UX improvements for the `polaris init` wizard:

1. Fix confirm step to display selected choices from previous steps
2. Show component progress (N of M) during component customization
3. Unify single-select interaction: space to select, enter to confirm

## Requirement 1: Fix Confirm Step Display

### Root Cause

`WizardScreen.renderFrame()` calls `console.clear()`, which wipes all terminal output. In `runConfirmHandler` (handlers.ts:131-179), `tools.refreshFrame()` is called three times (lines 149, 160, 171), each time clearing `clack.note` output from the previous block. The user sees none of the summary content.

### Fix

**handlers.ts — `runConfirmHandler`:** Remove the redundant `tools.refreshFrame()` calls at lines 160 and 171. Keep only line 149 (needed to refresh the frame after the async `buildInitPlanPreview` call). The `clack.note` calls will then persist on screen below the frame, and the `SelectPrompt` render (which does NOT use `console.clear()`) will appear below them.

**WizardPrompt.ts — `confirmAction`:** Add an optional `body?: string` parameter. When provided, the body text is rendered between the header and the options list (dimmed). This makes the confirm step self-contained — the summary is part of the prompt, so it survives any screen manipulation.

**runConfirmHandler** will then:
1. Call `tools.refreshFrame()` once (after `buildInitPlanPreview`)
2. Build the combined summary text from `formatInitChoicesSummary` + install plan + details
3. Pass it as `body` to `tools.prompt.confirmAction(message, body, stepNav)`
4. Remove all `clack.note` calls (no longer needed)

### Files Changed

- `src/wizard/WizardPrompt.ts` — add `body` parameter to `confirmAction`
- `src/commands/initWizard/handlers.ts` — restructure `runConfirmHandler`

## Requirement 2: Component Progress Display

### Change

In `runComponentsHandler`, when iterating through customizable components, pass `{index}` (1-based) and `{total}` template variables to the message templates.

### Implementation

Track `index` and `total` in the loop:

```
const customizableRefs = ctx.profileComponents.filter(ref => hasManifest)
const total = customizableRefs.length
customizableRefs.forEach((ref, i) => {
  const tplVars = { name: ref.name, index: String(i + 1), total: String(total) }
  // formatTemplate(templates.variantMessage, tplVars)
  // → "选择 superpowers 的安装变体：(2/5)"
})
```

The message templates in `init-wizard.yaml` can optionally include `{index}` and `{total}`:

```yaml
templates:
  variantMessage: "选择 {name} 的安装变体：({index}/{total})"
```

### Files Changed

- `src/commands/initWizard/handlers.ts` — add index/total tracking, pass to formatTemplate
- `resources/init-wizard.yaml` — update template strings (optional, defaults work)

## Requirement 3: Space-to-Select for Single-Select

### Change

Modify `WizardPrompt.select()` so that:
- Arrow keys move the cursor (unchanged)
- **Space** marks the current option as "selected" (like a radio button)
- **Enter** confirms the selected option and proceeds
- If no option was selected via space, Enter submits the current cursor position (fallback)

### Visual Design

| State | Marker |
|-------|--------|
| Unselected, cursor elsewhere | `○` dim |
| Unselected, cursor on it | `◯` cyan |
| Selected, cursor on it | `◉` green + cyan label |
| Selected, cursor elsewhere | `◉` green |

### Implementation

In `WizardPrompt.select()`:
- Track `selectedIndex: number` (initialized from `initialValue`, or -1)
- On `key.name === 'space'`: set `selectedIndex = this.cursor`
- On `key.name === 'return'`: submit `options[selectedIndex]` (or current cursor if -1)
- In the render function, use `selectedIndex` to determine the marker for each option

Key handler registration via `prompt.on('key', ...)` (in addition to the existing `attachStepNavHandlers`).

### Edge Cases

- **initialValue provided**: `selectedIndex` starts at the matching option index
- **No space pressed**: Enter submits the current cursor position (backward compatible)
- **Disabled options**: Space is ignored for disabled options

### Files Changed

- `src/wizard/WizardPrompt.ts` — modify `select()` method

## Testing

- Unit tests for `WizardPrompt.select` with the new space-to-select behavior
- Unit tests for `runConfirmHandler` to verify body content includes all selections
- Unit tests for `runComponentsHandler` to verify index/total in messages
- Manual E2E: run `polaris init` and verify all three improvements

## Non-Goals

- Changing `MultiSelectPrompt` interaction (already uses space-to-toggle)
- Modifying `SelectPrompt` native behavior in @clack/core (we layer on top)
- Adding progress bars or spinners (out of scope)
