# detail-design-template.md 模板（design 阶段 · 深度技术设计）

> **使用约定**：由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}design` Step 4.1 落盘前读取，产物落盘到 `openspec/changes/<change_id>/detailed-design.md`；Step 5.1 主审按本模板的节名与节序校验。
>
> **本阶段定位（深化 ≠ 替代）**：只深化 plan 阶段 `design.md` 已冻结的结论（Decisions / 架构 / 选型），不重述需求、不另起架构结论、不改 `proposal.md` 的范围与非目标。发现规格缺口只能以 Spec Patch 回写 `specs/*/spec.md`，不得在本文再造第二份需求。
>
> **专项承接（形状 A）**：预检判定「无需专项」时，该分面的实现级细节由 `## 1. 实现方案` 承载；一旦预检推荐并经用户确认某专项，该分面细节**必须搬进** `<slug>-design.md`，本文只保留 `## 5. 专项设计索引` 的索引行——不得两处各存一份。
>
> **节名与编号约定**：节名一律中文，与 Step 5.1 主审校验同源；六个必含节的措辞不得改写。

## 模板正文

```markdown
---
change: {{CHANGE_ID}}
role: technical-design
canonical_spec: openspec
---

# {{CHANGE_ID}} — 深度技术设计

> 定位：把高层 `design.md` 深化到 build 可直接执行的粒度。深化 ≠ 替代。
> 澄清依据：`brainstorm-summary.md`　专项预检：`specialty-precheck.md`

## 1. 实现方案
{{IMPLEMENTATION}}

## 2. 边界条件
{{BOUNDARIES}}

## 3. 技术风险与缓解
{{RISKS}}

## 4. 测试策略
{{TEST_STRATEGY}}

## 5. 专项设计索引
{{SPECIALTY_INDEX}}

## 6. Spec Patch 清单
{{SPEC_PATCH}}
```

---

## 强制规则

1. **必含节**：`## 1. 实现方案`、`## 2. 边界条件`、`## 3. 技术风险与缓解`、`## 4. 测试策略`、`## 5. 专项设计索引`、`## 6. Spec Patch 清单`——措辞原样保留，缺任一 → Step 5.1 主审记 Important
2. **frontmatter**：`change` / `role` / `canonical_spec` 三字段必须齐备且取值正确，不得增删
3. **风险与缓解**：不得只列风险标题；关键路径的风险必须有对应缓解，或显式写明「接受 + 理由」
4. **边界条件**：至少覆盖与主路径相关的失败 / 降级 / 空数据场景，逐条可判定
5. **Spec Patch 清单**：无回写时明确写「无」；有回写则同步改 `specs/*/spec.md`
6. **专项索引**：未拆专项时写「无」；拆了则逐行给出「专项文件 + 覆盖范围」，且该分面细节不得在本文重复出现
7. **深度边界**：只写「怎么实现」，不重述「要什么」（需求归 `specs`）、不重述高层架构结论（归 `design.md`）
8. **模板变量**：正文中所有 `{{...}}` 必须在生成时替换为真实值，不得原样留空
