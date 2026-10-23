# explore-router 场景走读验证

本文件记录 3 个合成 PRD 场景的手动走读结果，验证 SKIP / LIGHT / FULL 路由逻辑。

## 场景 1：高清晰度 L1 → 期望 SKIP

**输入**：`test/fixtures/explore-router/scenario-1-high-clarity-l1.md`

**变更等级**：L1（单模块头像上传，无 schema 迁移，可回滚）

| ID | 得分 | 证据摘要 |
|----|------|---------|
| D1-1 | 1 | 「成功率 92%→99%」「P99 ≤ 2s」 |
| D1-2 | 1 | 明确排除 GIF/批量/裁剪 |
| D1-3 | 1 | P0 + 2026-04-15 |
| D1-4 | 1 | 已登录 C 端用户，个人设置页 |
| D2-1 | 1 | Gherkin 场景 4 条 |
| D2-2 | 1 | 异常 3/4 = 75% |
| D2-3 | 1 | P99 ≤ 2s、HTTPS |
| D2-4 | 1 | 明确错误文案与状态码 |
| D3-1 | 1 | user-profile、/api/v1/avatar、users.avatar_url |
| D3-2 | 1 | OSS 已确认配额 |
| D3-3 | 1 | 无迁移，仅字段更新 |
| D4-1 | 1 | React + Node.js 现有栈 |
| D4-2 | 1 | 复用 OSS SDK，已共识 |
| D5-1 | 1 | 类型白名单 + 大小限制 |
| D5-2 | 1 | 符合上传安全红线 |

**总分**：15/15 | **初判**：SKIP（L1 ≥8）| **陷阱**：无 | **最终**：**SKIP** ✅

---

## 场景 2：篇幅长低清晰度 → 期望 FULL

**输入**：`test/fixtures/explore-router/scenario-2-long-low-clarity.md`

**变更等级**：L3（全面升级、多模块、售后集成、国际化）

| ID | 得分 | 证据摘要 |
|----|------|---------|
| D1-1 | 0 | 「要快」「体验流畅」无量化 |
| D1-2 | 0 | 文档未提及排除项 |
| D1-3 | 0 | 「尽快上线」无 deadline |
| D1-4 | 1 | 运营、管理员（勉强明确） |
| D2-1 | 0 | 无 GWT，仅用户故事 |
| D2-2 | 0 | 无异常场景 |
| D2-3 | 0 | 「稳定可靠」无量化 |
| D2-4 | 0 | 「功能正常工作」不可测试 |
| D3-1 | 0 | 无模块/接口/表清单 |
| D3-2 | 0 | 售后「联动」未确认 |
| D3-3 | 0 | 文档未提及 |
| D4-1 | 0 | 「沿用类似架构」模糊 |
| D4-2 | 0 | 无共识证据 |
| D5-1 | 0 | 未对照 constitution |
| D5-2 | 0 | 权限描述模糊 |

**总分**：1/15 | **初判**：FULL（L3 模糊）| **核心三维**：D1=1, D2=0, D3=0 全 ≤1

**陷阱命中**：TRAP-1（篇幅幻觉）、TRAP-2（形容词）、TRAP-3（Happy Path）、TRAP-4（参考 v2）、TRAP-5（技术盲区）、TRAP-6（不可测试 AC）

**最终**：**FULL** ✅

---

## 场景 3：L3 高分 → 期望 LIGHT（非 SKIP）

**输入**：`test/fixtures/explore-router/scenario-3-l3-high-score.md`

**变更等级**：L3（架构重构、数据迁移、多团队、新组件）

| ID | 得分 | 证据摘要 |
|----|------|---------|
| D1-1 | 1 | 成功率 97.5%→99.5%、P99 800→300ms |
| D1-2 | 1 | 排除退款/海外/结算 |
| D1-3 | 1 | P0 + 2026-Q3 |
| D1-4 | 1 | 3 业务线 + 运维 |
| D2-1 | 1 | Gherkin 完整 |
| D2-2 | 1 | 异常 8 条占 40% |
| D2-3 | 1 | P99/可用性/PCI-DSS |
| D2-4 | 1 | 明确错误码与幂等行为 |
| D3-1 | 1 | 3 服务、12 API、3 表 |
| D3-2 | 1 | 订单/运维/渠道对接人周 |
| D3-3 | 1 | 双写 2 周 + 回滚方案 |
| D4-1 | 0 | 引入 Resilience4j 新组件 |
| D4-2 | 1 | 2026-02 技术评审通过 |
| D5-1 | 1 | 符合支付安全红线 |
| D5-2 | 1 | 不突破商户数据隔离 |

**总分**：14/15 | **分数初判**：若 L2 则 SKIP（≥12）| **L3 规则**：不得 SKIP

**陷阱**：无命中 | **最终**：**LIGHT** ✅

---

## 落盘格式验证

以场景 1 为例生成样例报告，确认模板字段完整：

- [x] evaluated_at / input_documents / input_hash
- [x] change_level / change_level_source
- [x] total_score / routing / routing_before_traps
- [x] dimension_scores（5 维）
- [x] scoring_detail（15 项 + evidence）
- [x] trap_flags（6 条）
- [x] TOP 3 缺口
- [x] recommended_next_steps
- [x] light_explore_actions（LIGHT 时）
- [x] 评估历史节

样例报告路径：`test/fixtures/explore-router/sample-clarity-report-scenario1.md`

## 结论

三项路由判定均符合计划预期，skill 规则可正确区分 SKIP / LIGHT / FULL。
