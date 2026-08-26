# Discovery Templates

## Q1: Name + Module (First Question)

> Your requirement: **{user original description}**
>
> My inference:
> - Name: **{inferred name}**
> - Module: **{inferred module}** (from KB keyword table)
>
> Confirm or correct:
> - 🟢 **A. Both correct** (recommended)
> - **B. Different name** → actually: `______`
> - **C. Different module** → actually belongs to: `______`
> - **D. Both different** → name: `______` module: `______`
>
> Reply A, or B/C/D with details.

## Q2: Scope Confirmation

> Requirement **{name}** scope, my understanding:
> - **Include**: {feature A, feature B}
> - **Exclude**: {feature C, feature D} (not in this scope)
>
> Confirm or supplement:
> - 🟢 **A. Correct** (recommended)
> - **B. Need more** → supplement: `______`
> - **C. An excluded item should be included** → explain: `______`
>
> Reply A/B/C.

## Q3: Role Confirmation

> Main roles using this feature:
> - 🟢 **A. Admin** (recommended: full config access)
> - **B. User + Admin** (for: functional differences between users)
> - **C. Approver + Editor + Viewer** (for: approval or permission layers)
> - **D. Custom** → roles: `______`
>
> If C, follow up: Are permission boundaries between roles clearly defined?

## Q4: Core Flows (Medium/High Complexity)

> Core operation flow, my inference:
> 1. **{Step 1}**: {description}
> 2. **{Step 2}**: {description}
> 3. **{Step 3}**: {description}
>
> Correct?
> - 🟢 **A. Correct** (recommended)
> - **B. Missing steps** → supplement: `______`
> - **C. Wrong order** → correct order: `______`
>
> Reply A/B/C.

## Q5: Metrics & Validation

> What effect does this requirement aim for?
> - 🟢 **A. Efficiency improvement** (recommended: e.g. operation time reduced 50%)
> - **B. Error reduction** (for: compliance flows)
> - **C. User satisfaction** (for: UX optimization)
> - **D. Specific quantified goal** → explain: `______`

## Q6: Exceptions & Constraints

> What exception scenarios must be considered?
> - 🟢 **A. Permission insufficient / data missing** (recommended: common exceptions)
> - **B. Network / concurrency conflict** (for: high-frequency write scenarios)
> - **C. State transition error** (for: approval/publish flows)
> - **D. Custom** → explain: `______`

## Capability Architecture Template (Phase 4.5)

```markdown
## Capability Architecture — {req}

### Capability Layer
- **GC-001**: {capability 1}
  - Description: {one sentence}
  - Scenes: {scene 1}, {scene 2}
- **GC-002**: {capability 2}
  - ...

### Scenario Layer
- **SC-001**: {scene 1}
  - Trigger: {condition}
  - Capabilities: {GC-001} (anchor reference)
- **SC-002**: {scene 2}
  - ...
```

## Discovery Document Template

```markdown
# {req} — Discovery v1

## Metadata
| Item | Value |
| Module | {module} |
| Version | v1 |
| Date | {YYYY-MM-DD} |

## Scope
- Include: A, B, C
- Exclude: D, E (next phase)

## Roles
- Primary: Admin, Editor
- Related: Auditor (read-only)

## Required Answers
1. Name + module: {answer}
2. Scope: {answer}
3. Roles: {answer}
4. Core flows: {answer}
5. Metrics: {answer}
6. Config model: {answer}
```
