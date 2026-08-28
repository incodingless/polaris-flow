# PRD Conventions — Full Specification

## §1 PRD Chapter Structure

### 1.1 Draft (7 chapters)

| # | Chapter | Content |
|:---:|:---|:---|
| 0 | **Capability Architecture** | Capability layer + scenario layer + reuse graph |
| 1 | **Background** | Source, problem, target users, quantified value |
| 2 | **Business Flow & Sequence** | Main flowchart + key sequence diagram |
| 3 | **Requirement Details** | Organized by capability architecture |
| 4 | **Version Record** | Doc version, author, date |
| 5 | **Update Record** | Summary of each change |
| 6 | **Acceptance Criteria** | Quantifiable, verifiable conditions |

**Forbidden in draft**: API contracts, data models, permission management.

### 1.2 Final (14 chapters)

Inherits draft chapters 1, 2, 3, 4, 5, 6. Adds:

| # | Chapter | Content |
|:---:|:---|:---|
| 2 | **Value** | Quantified goals + benefit breakdown |
| 3 | **Feature List** | All features (priority, owner, release) |
| 4 | **System Architecture** | High-level architecture + data flow |
| 7 | **API Contracts** | All external/internal API specs |
| 8 | **Data Model** | Entities, fields, state enums |
| 9 | **Permission** | Role matrix, data permissions |
| 10 | **Metrics** | Monitoring metrics, report definitions |
| 11 | **Open Items** | Pending questions |
| 12 | **Default Assumptions** | AI-inferred defaults |

### 1.3 Capability Architecture Organization

```markdown
## 3 Requirement Details

### 3.1 Capability Layer
#### 3.1.1 List Query (GC-001)
...full description (fields, rules, exceptions)...

### 3.2 Scenario Layer
#### 3.2.1 Pending Approval List
- Reuses [GC-001 List Query](#311-list-querygc-001)
- Scenario-specific: default filter "pending my approval"
```

---

## §2 Directory Layout

```
<prdRoot>/{req}/
├── {req}-discovery-v{N}.md
├── {req}-draft-v{N}.md
├── {req}-final-v{N}.md
├── sessions/
│   ├── discovery-confirmed-sections.json
│   ├── draft_confirmed_sections.json
│   ├── update_confirmed_sections.json
│   └── archive-log-v{N}.md
├── reviews/
│   ├── review-report-v{N}.md
│   └── testability-report-v{N}.md
├── prototypes/
│   └── prototype-v{N}.html
├── changes/
│   └── change-suggestion-v{N}.md
└── guides/
    └── operation-guide-v{N}.md
```

Default `<prdRoot>`: `<project>/docs/prd/`. Overridable in §11 init config.

---

## §3 Naming Conventions

| Object | Rule | Example |
|:---|:---|:---|
| Req directory | `{YYYYMMDD}-{module}-{feature}` | `20260518-portal-dashboard-share` |
| Discovery | `{req}-discovery-v{N}.md` | `dashboard-share-discovery-v1.md` |
| Draft | `{req}-draft-v{N}.md` | `dashboard-share-draft-v1.md` |
| Final | `{req}-final-v{N}.md` | `dashboard-share-final-v1.md` |
| Capability anchor | `GC-{3-digit}` | `GC-001` |
| Scenario anchor | `SC-{3-digit}` | `SC-001` |

**Forbidden**: Mixed Chinese/English punctuation; missing version numbers; spaces instead of hyphens.

---

## §4 Discovery Document Format

| Section | Content |
|:---|:---|
| Metadata | Req name, module, version, date, confirmer |
| Scope | Included and **excluded** features |
| Roles | Who uses, who has permissions |
| Core Flows | Main flow + key decision points |
| Metrics | Quantified goals, monitoring metrics |
| Config | System-level configs (if any) |
| Required Answers | Answers to 6 required questions |
| Open Items | Pending user confirmation |

---

## §5 Change Management

### 5.1 Change Level

| Level | Trigger (any) | Path |
|:---|:---|:---|
| **L1 Tweak** | Change 1-2 params / adjust text / adjust style | Summary → change list → confirm affected chapters → edit → self-check → sync Discovery |
| **L1 or L2 (border)** | Change ≥3 params / adjust flow order / change enum values | Evaluate impact; lean toward L2 |
| **L2 Standard** | New feature / new role / new flow / cross-module / change core BR / adjust process | Full 3-phase (change proposal → Discovery update → PRD finalize) |

### 5.2 Change Execution List (Mandatory)

All changes must first generate a change execution list:

```markdown
## Change Execution List — {req} v2

### Change 1: Change XX from 30s to 60s
- **Type**: L1 Tweak
- **Locations**:
  - Discovery §X: item N
  - PRD §3.1.2: paragraph N
  - PRD §7 (API): refresh_interval default
- **Ripple**: See §6
```

### 5.3 Discovery Sync Hard Rules

- Any PRD edit **must** sync update Discovery
- Discovery edit **must** re-run position mapping scan
- Forbidden: "edit PRD only" or "edit Discovery only"

---

## §6 Ripple Effect Scan

| Change Type | Must Check Linked Locations |
|:---|:---|
| Feature description | Feature list table row; PRD §3 corresponding capability |
| Constraint/rule | Flowchart decision node; sequence diagram message; PRD §3 BR table |
| Enum/state | Data model enum section; PRD §3 state description |
| Role/permission | Permission matrix row; PRD §3 user story role |
| Interaction flow | System architecture overall flow; PRD §2 main flowchart |
| API signature | API contract + data model + frontend API layer |

---

## §7 Confirm-by-Chapter

Long skills (discovery / draft / update L2) must confirm per chapter:

1. Output **one** chapter draft
2. User replies "OK / confirmed" or specific edits
3. **Immediately save** to `sessions/*.json`
4. Proceed to next chapter

**Interrupt recovery**: Skill scans `sessions/` on startup.

---

## §8 Document Persistence & Recovery

| Artifact | Location | Owner |
|:---|:---|:---|
| Change proposal | `changes/change-suggestion-v{N}.md` | prd-update / prd-prototype |
| Review report | `reviews/review-report-v{N}.md` | prd-review |
| Testability report | `reviews/testability-report-v{N}.md` | prd-testability |
| Chapter confirmations | `sessions/*_confirmed_sections.json` | All long skills |
| Discovery | `{req}-discovery-v{N}.md` | prd-discovery |
| PRD | `{req}-draft/final-v{N}.md` | prd-draft / prd-final |

---

## §9 Product Language Principle

**Forbidden** in PRD (except §7 API contracts and §8 data model):

| Forbidden | Alternative |
|:---|:---|
| Class names (`OrderService`) | "Order Service" |
| Method names (`cancelOrder()`) | "Cancel Order" operation |
| Table names (`t_order`) | "Order Table" |
| Field names (`order_status`) | "Order Status" |
| HTTP method + path (`POST /api/order`) | "Place Order API" |

---

## §10 Severity Levels

| Level | Icon | Meaning | Action |
|:---|:---:|:---|:---|
| Block | 🔴 | Dev asks "how do I do this? Need PM confirmation" | Must fix before development |
| Suggest | 🟡 | Dev "roughly knows, but details unclear" | Should fix; can agree default with dev |
| Note | 🔵 | Doesn't affect understanding; "nicer if fixed" | Fix when time allows |

All `prd-review` and `prd-testability` use this scale. No custom scales.

---

## §11 Initialization Config

Stored at `<project>/.trae/prd-config.md`.

| Config | Default | Description |
|:---|:---|:---|
| prdRoot | `<project>/docs/prd/` | All PRD artifact location |
| kbRoot | `<project>/` | Knowledge base load path |
| Template style | Standard (draft 7 / final 14 chapters) | See §1 |
| Testability standard | Built-in 10 items | See prd-testability |
| Naming style | Mixed Chinese/English | See §3 |
| Auto-archive after deploy | Prompt user | See prd-archive |

Init flow: Trigger → detect existing config → 4-6 questions → write prd-config.md → done.
