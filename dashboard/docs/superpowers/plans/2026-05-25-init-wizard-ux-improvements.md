# Init Wizard UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three UX improvements: fix confirm step display, add component progress count, unify single-select to space+enter.

**Architecture:** Two areas of change — (A) `WizardPrompt`: add `body` param to `confirmAction`/`select`, add space-to-select to `select`; (B) init wizard handlers: restructure `runConfirmHandler` to use body instead of clack.note, add index/total template vars in `runComponentsHandler`. Plus config template updates.

**Tech Stack:** TypeScript, @clack/core (SelectPrompt/MultiSelectPrompt), chalk, vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/wizard/WizardPrompt.ts` | Modify | `body` param on `select`/`confirmAction`; space-to-select in `select` |
| `src/commands/initWizard/handlers.ts` | Modify | Restructure `runConfirmHandler`; add progress to `runComponentsHandler`; remove clack import |
| `resources/init-wizard.yaml` | Modify | Add `{index}/{total}` to template strings |
| `src/commands/initWizard/stepDefaults.ts` | Modify | Add `{index}/{total}` to default templates |

---

### Task 1: Add `body` parameter to `WizardPrompt.select` and `confirmAction`

**Files:**
- Modify: `src/wizard/WizardPrompt.ts:69-104,164-178`

- [ ] **Step 1: Add optional `body` parameter to `select` method**

In `src/wizard/WizardPrompt.ts`, change the `select` method signature at line 69:

```typescript
  async select<T>(
    message: string,
    options: SelectOption<T>[],
    initialValue: T | undefined,
    stepNav: StepNavOptions,
    body?: string
  ): Promise<WizardStepOutcome<T>> {
```

- [ ] **Step 2: Render `body` text in the SelectPrompt render function**

In the same method, modify the render function (lines 85-97) to include body text between header and options. Replace:

```typescript
      render(this: SelectPrompt<CoreOption<T>>) {
        const header = `${stepSymbol(this.state)}  ${chalk.bold(message)}`
        const body = this.options
          .map((opt, i) => {
            const active = i === this.cursor
            const marker = active ? chalk.cyan('◯') : chalk.dim('○')
            const label = active ? chalk.cyan(opt.label) : opt.label
            const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : ''
            return `  ${marker} ${label}${hint}`
          })
          .join('\n')
        return appendSelectionFooter(`${header}\n${body}`, stepNav)
      }
```

With:

```typescript
      render(this: SelectPrompt<CoreOption<T>>) {
        const header = `${stepSymbol(this.state)}  ${chalk.bold(message)}`
        const bodySection = body ? `\n${chalk.dim(body)}\n` : ''
        const opts = this.options
          .map((opt, i) => {
            const active = i === this.cursor
            const marker = active ? chalk.cyan('◯') : chalk.dim('○')
            const label = active ? chalk.cyan(opt.label) : opt.label
            const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : ''
            return `  ${marker} ${label}${hint}`
          })
          .join('\n')
        return appendSelectionFooter(`${header}${bodySection}\n${opts}`, stepNav)
      }
```

- [ ] **Step 3: Update `confirmAction` to accept and pass through `body`**

Change the `confirmAction` method signature (line 164) from:

```typescript
  async confirmAction(
    message: string,
    stepNav: StepNavOptions
  ): Promise<WizardStepOutcome<'proceed' | 'abort'>> {
    return this.select(
      message,
      [
        { value: 'proceed' as const, label: '确认执行', hint: '开始安装' },
        { value: 'abort' as const, label: '取消', hint: '放弃本次操作' }
      ],
      undefined,
      stepNav
    )
  }
```

To:

```typescript
  async confirmAction(
    message: string,
    stepNav: StepNavOptions,
    body?: string
  ): Promise<WizardStepOutcome<'proceed' | 'abort'>> {
    return this.select(
      message,
      [
        { value: 'proceed' as const, label: '确认执行', hint: '开始安装' },
        { value: 'abort' as const, label: '取消', hint: '放弃本次操作' }
      ],
      undefined,
      stepNav,
      body
    )
  }
```

- [ ] **Step 4: Verify the file compiles**

```bash
npx tsc --noEmit src/wizard/WizardPrompt.ts
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/wizard/WizardPrompt.ts
git commit -m "feat(wizard): add body parameter to select and confirmAction methods"
```

---

### Task 2: Restructure `runConfirmHandler` to display selections

**Files:**
- Modify: `src/commands/initWizard/handlers.ts:1-179`

- [ ] **Step 1: Replace `runConfirmHandler` body and remove `clack` import**

In `src/commands/initWizard/handlers.ts`:

Remove the `import * as clack from '@clack/prompts'` import (line 1).

Replace the entire `runConfirmHandler` function body (lines 131-179) with:

```typescript
export async function runConfirmHandler(
  ctx: InitWizardCtx,
  tools: WizardTools,
  step: InitWizardStepRuntime
): Promise<WizardStepOutcome<unknown>> {
  if (step.handler !== 'confirm') {
    throw new Error(`runConfirmHandler expected handler confirm, got ${step.handler}`)
  }

  const titles = getConfirmTitles(step)
  const preview = await buildInitPlanPreview(ctx.appCtx, {
    profileName: ctx.profileName,
    ides: ctx.ides,
    scope: ctx.scope,
    componentOverrides: ctx.componentOverrides,
    componentChoices: buildComponentChoicesForSummary(ctx)
  })

  const installBody = [
    `组件: ${preview.componentCount} 个`,
    `文件写入: ${preview.fileWriteCount} 项`,
    ...(preview.conflictCount > 0
      ? [`⚠ 检测到 ${preview.conflictCount} 处冲突（可使用 --force 覆盖）`]
      : [])
  ].join('\n')

  let detailText = ''
  if (preview.lines.length > 0) {
    const limit = titles.detailLinesLimit
    const previewText = preview.lines.slice(0, limit).join('\n')
    const suffix =
      preview.lines.length > limit ? `\n… 另有 ${preview.lines.length - limit} 项` : ''
    detailText = previewText + suffix
  }

  const body = [
    `【${titles.choicesNoteTitle}】`,
    formatInitChoicesSummary(ctx),
    '',
    `【${titles.installNoteTitle}】`,
    installBody,
    ...(detailText ? ['', `【${titles.detailNoteTitle}】`, detailText] : [])
  ].join('\n')

  tools.refreshFrame()
  const outcome = await tools.prompt.confirmAction(getStepMessage(step), stepNav(tools), body)
  if (outcome.action !== 'next') return outcome
  if (outcome.value === 'abort') {
    ctx.logger.info('Aborted by user.')
    return { action: 'cancel' }
  }
  return { action: 'next', value: true }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/commands/initWizard/handlers.ts
```

Expected: no errors.

- [ ] **Step 3: Run existing init wizard tests**

```bash
npx vitest run tests/integration/init-wizard.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/initWizard/handlers.ts
git commit -m "fix(init): display selected choices in confirm step via body param"
```

---

### Task 3: Add component progress display to `runComponentsHandler`

**Files:**
- Modify: `src/commands/initWizard/handlers.ts:54-114`

- [ ] **Step 1: Convert loop to indexed for-loop with template variables**

In `runComponentsHandler`, replace the loop (lines 54-114):

From:
```typescript
  for (const ref of ctx.profileComponents) {
    let manifest: ComponentManifest
    try {
      const resolved = await registry.resolve(ref.name)
      manifest = resolved.manifest
    } catch {
      ctx.logger.warn(`跳过 ${ref.name} 定制：无法加载 manifest`)
      continue
    }

    let chosenVariant = overrides.get(ref.name)?.variant
    const variantNames = Object.keys(manifest.variants)

    if (variantNames.length > 0) {
      tools.refreshFrame()
      const variantInitial = overrides.get(ref.name)?.variant

      const variantOutcome = await tools.prompt.select(
        formatTemplate(templates.variantMessage, { name: ref.name }),
        variantNames.map((name) => ({
          value: name,
          label: name,
          hint: manifest.variants[name]?.description
        })),
        variantInitial,
        stepNav(tools)
      )
      if (variantOutcome.action !== 'next') return variantOutcome
      chosenVariant = variantOutcome.value
      overrides.set(ref.name, { ...overrides.get(ref.name), variant: chosenVariant })
    }

    const skillChoices = collectSkillChoices(manifest)
    if (skillChoices.length === 0 || chosenVariant === 'full') continue

    tools.refreshFrame()
    const customizeOutcome = await tools.prompt.confirm(
      formatTemplate(templates.customizeSkillsMessage, { name: ref.name }),
      stepNav(tools)
    )
    if (customizeOutcome.action !== 'next') return customizeOutcome

    if (customizeOutcome.value) {
      tools.refreshFrame()
      const skillsInitial = overrides.get(ref.name)?.skills ?? []
      const skillsOutcome = await tools.prompt.multiselect(
        formatTemplate(templates.skillsMessage, { name: ref.name }),
        skillChoices.map((skill) => ({ value: skill, label: skill })),
        skillsInitial,
        stepNav(tools),
        true
      )
      if (skillsOutcome.action !== 'next') return skillsOutcome
      overrides.set(ref.name, { ...overrides.get(ref.name), skills: skillsOutcome.value })
    } else if (chosenVariant && getSkillsForVariant(manifest, chosenVariant)) {
      overrides.set(ref.name, {
        ...overrides.get(ref.name),
        skills: getSkillsForVariant(manifest, chosenVariant)
      })
    }
  }
```

To:

```typescript
  const total = ctx.profileComponents.length
  for (let i = 0; i < ctx.profileComponents.length; i++) {
    const ref = ctx.profileComponents[i]!
    const tplVars = { name: ref.name, index: String(i + 1), total: String(total) }

    let manifest: ComponentManifest
    try {
      const resolved = await registry.resolve(ref.name)
      manifest = resolved.manifest
    } catch {
      ctx.logger.warn(`跳过 ${ref.name} 定制：无法加载 manifest`)
      continue
    }

    let chosenVariant = overrides.get(ref.name)?.variant
    const variantNames = Object.keys(manifest.variants)

    if (variantNames.length > 0) {
      tools.refreshFrame()
      const variantInitial = overrides.get(ref.name)?.variant

      const variantOutcome = await tools.prompt.select(
        formatTemplate(templates.variantMessage, tplVars),
        variantNames.map((name) => ({
          value: name,
          label: name,
          hint: manifest.variants[name]?.description
        })),
        variantInitial,
        stepNav(tools)
      )
      if (variantOutcome.action !== 'next') return variantOutcome
      chosenVariant = variantOutcome.value
      overrides.set(ref.name, { ...overrides.get(ref.name), variant: chosenVariant })
    }

    const skillChoices = collectSkillChoices(manifest)
    if (skillChoices.length === 0 || chosenVariant === 'full') continue

    tools.refreshFrame()
    const customizeOutcome = await tools.prompt.confirm(
      formatTemplate(templates.customizeSkillsMessage, tplVars),
      stepNav(tools)
    )
    if (customizeOutcome.action !== 'next') return customizeOutcome

    if (customizeOutcome.value) {
      tools.refreshFrame()
      const skillsInitial = overrides.get(ref.name)?.skills ?? []
      const skillsOutcome = await tools.prompt.multiselect(
        formatTemplate(templates.skillsMessage, tplVars),
        skillChoices.map((skill) => ({ value: skill, label: skill })),
        skillsInitial,
        stepNav(tools),
        true
      )
      if (skillsOutcome.action !== 'next') return skillsOutcome
      overrides.set(ref.name, { ...overrides.get(ref.name), skills: skillsOutcome.value })
    } else if (chosenVariant && getSkillsForVariant(manifest, chosenVariant)) {
      overrides.set(ref.name, {
        ...overrides.get(ref.name),
        skills: getSkillsForVariant(manifest, chosenVariant)
      })
    }
  }
```

The only changes are:
- Added `const total = ctx.profileComponents.length` before the loop
- Changed `for (const ref of ctx.profileComponents)` to indexed `for` loop
- Added `const tplVars = { name: ref.name, index: String(i + 1), total: String(total) }`
- Replaced `{ name: ref.name }` with `tplVars` in all three `formatTemplate` calls

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/commands/initWizard/handlers.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/initWizard/handlers.ts
git commit -m "feat(init): show component progress (index/total) during customization"
```

---

### Task 4: Update templates with progress placeholders

**Files:**
- Modify: `resources/init-wizard.yaml:37-40`
- Modify: `src/commands/initWizard/stepDefaults.ts:19-23`

- [ ] **Step 1: Update `init-wizard.yaml` templates**

In `resources/init-wizard.yaml`, change lines 37-40 from:

```yaml
    templates:
      variantMessage: "选择 {name} 的安装变体："
      customizeSkillsMessage: "是否自定义 {name} 的 Skills 子集？"
      skillsMessage: "选择 {name} 要安装的 Skills："
```

To:

```yaml
    templates:
      variantMessage: "选择 {name} 的安装变体：({index}/{total})"
      customizeSkillsMessage: "是否自定义 {name} 的 Skills 子集？({index}/{total})"
      skillsMessage: "选择 {name} 要安装的 Skills：({index}/{total})"
```

- [ ] **Step 2: Update default templates in `stepDefaults.ts`**

In `src/commands/initWizard/stepDefaults.ts`, change lines 19-23 from:

```typescript
const COMPONENTS_TEMPLATES_DEFAULTS = {
  variantMessage: '选择 {name} 的安装变体：',
  customizeSkillsMessage: '是否自定义 {name} 的 Skills 子集？',
  skillsMessage: '选择 {name} 要安装的 Skills：'
}
```

To:

```typescript
const COMPONENTS_TEMPLATES_DEFAULTS = {
  variantMessage: '选择 {name} 的安装变体：({index}/{total})',
  customizeSkillsMessage: '是否自定义 {name} 的 Skills 子集？({index}/{total})',
  skillsMessage: '选择 {name} 要安装的 Skills：({index}/{total})'
}
```

- [ ] **Step 3: Run init wizard config tests**

```bash
npx vitest run tests/unit/init-wizard-config.test.ts
```

Expected: all tests pass (config schema still valid).

- [ ] **Step 4: Commit**

```bash
git add resources/init-wizard.yaml src/commands/initWizard/stepDefaults.ts
git commit -m "feat(init): add progress placeholders {index}/{total} to component templates"
```

---

### Task 5: Implement space-to-select for single-select prompts

**Files:**
- Modify: `src/wizard/WizardPrompt.ts:69-104`

- [ ] **Step 1: Replace the `select` method with space-to-select implementation**

Replace the entire `select` method (lines 69-104) in `src/wizard/WizardPrompt.ts`:

```typescript
  async select<T>(
    message: string,
    options: SelectOption<T>[],
    initialValue: T | undefined,
    stepNav: StepNavOptions,
    body?: string
  ): Promise<WizardStepOutcome<T>> {
    const coreOptions: CoreOption<T>[] = options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
      disabled: o.disabled
    }))

    const initialIdx =
      initialValue !== undefined
        ? coreOptions.findIndex((o) => o.value === initialValue && !o.disabled)
        : -1
    let selectedIndex = initialIdx

    // If no initial selection and only one enabled option, pre-select it
    if (selectedIndex === -1) {
      const enabledOpts = coreOptions.filter((o) => !o.disabled)
      if (enabledOpts.length === 1) {
        selectedIndex = coreOptions.indexOf(enabledOpts[0]!)
      }
    }

    const prompt = new SelectPrompt({
      options: coreOptions,
      initialValue,
      render(this: SelectPrompt<CoreOption<T>>) {
        const header = `${stepSymbol(this.state)}  ${chalk.bold(message)}`
        const bodySection = body ? `\n${chalk.dim(body)}\n` : ''
        const opts = this.options
          .map((opt, i) => {
            const isCursor = i === this.cursor
            const isSelected = i === selectedIndex
            let marker: string
            if (isSelected && isCursor) {
              marker = chalk.green('◉')
            } else if (isSelected) {
              marker = chalk.green('◉')
            } else if (isCursor) {
              marker = chalk.cyan('◯')
            } else {
              marker = chalk.dim('○')
            }
            const label = isCursor ? chalk.cyan(opt.label) : opt.label
            const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : ''
            return `  ${marker} ${label}${hint}`
          })
          .join('\n')
        return appendSelectionFooter(`${header}${bodySection}\n${opts}`, stepNav)
      }
    })

    // Space: mark current option as selected
    prompt.on('key', (_char, key) => {
      if (key.name === 'space') {
        const idx = prompt.cursor
        if (idx >= 0 && idx < coreOptions.length && !coreOptions[idx]?.disabled) {
          selectedIndex = idx
        }
        return
      }
    })

    // Enter: submit the space-selected option (if any), overriding cursor position
    prompt.on('key', (_char, key) => {
      if (key.name === 'return' && selectedIndex >= 0) {
        const opt = coreOptions[selectedIndex]
        if (opt && !opt.disabled) {
          prompt.value = opt.value as unknown as T
        }
      }
    })

    this.attachStepNavHandlers(prompt, stepNav, () => true)

    const result = await prompt.prompt()
    return this.toOutcome(result)
  }
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/wizard/WizardPrompt.ts
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to check for regressions**

```bash
npx vitest run tests/unit/wizard-engine.test.ts tests/unit/wizard-screen.test.ts tests/integration/init-wizard.test.ts
```

Expected: all existing tests pass.

Note: The init-wizard integration test mocks `WizardPrompt`, so it won't test the new space-to-select behavior directly. The engine and screen tests don't use WizardPrompt either. So this is a regression check only.

- [ ] **Step 4: Commit**

```bash
git add src/wizard/WizardPrompt.ts
git commit -m "feat(wizard): implement space-to-select for single-select prompts"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript check on full project**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify all changes are committed**

```bash
git status
git log --oneline -6
```

Expected: clean working tree, 5 new commits on the branch.

---
