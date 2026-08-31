# Section 1-4：四节评审

> 归属：`polaris{{SKN_SPR}}flow{{SKN_SPR}}plan` 技能。由 **`plan-review-agent`** 在范围挑战之后顺序执行。  
> **一次性报告模式**：每节发现写入 Plan Review Report 对应章节与 Findings，**禁止** `ask_followup_question` / 一问一议；用户决策由 plan skill 消化 STATUS 时处理。

## Section 1：架构评审

详细维度参见 `./references/engineering-mindset.md` 中的「15 条工程经理认知模式」（尤其 #3 默认无聊、#10 本质 vs 偶然复杂性、#11 两周嗅探）。

评估清单：

- 整体系统设计与组件边界
- 依赖图与耦合关注
- 数据流模式与潜在瓶颈
- 扩展性特征与单点故障
- 安全架构（认证、数据访问、API 边界）
- 哪些关键流程值得在计划/代码注释中嵌入 ASCII 图
- 对每条新代码路径或集成点，描述一个真实的生产失败场景，并检查计划是否考虑了它
- **分发架构**：若引入新构件（binary、package、container），如何构建、发布、更新？CI/CD 流水线是计划一部分还是被推迟？

## Section 2：代码质量评审

评估清单：

- 代码组织与模块结构
- DRY 违规——此处严苛
- 错误处理模式与缺失的边界情况（显式标出）
- 技术债热点
- 相对于工程偏好，过度工程化或欠工程化的区域
- 已触及文件中现有的 ASCII 图——本次改动后是否仍准确？

## Section 3：测试评审

**完整方法论详见 `./references/test-review-methodology.md`**。这是本 skill 最重的一节，目标 100% 覆盖。

核心步骤（精简版）：

1. **Step 1**：检测项目测试框架
2. **Step 2**：追踪计划中每条代码路径（画出执行 ASCII 图）
3. **Step 3**：映射用户流、交互边界情况、错误状态
4. **Step 4**：对照现有测试逐分支检查（★/★★/★★★ 评分）
5. **Step 5**：应用 E2E vs Unit 决策矩阵
6. **Step 6**：产出 ASCII 覆盖率图（代码路径 + 用户流合并展示）
7. **Step 7**：把缺失的测试写入报告「建议加入 tasks」清单（**不改** tasks.md；由 plan skill 消化）

### 回归测试铁律

**当覆盖率审计识别出"回归"——之前能工作但本次 diff 弄坏的代码——必须把回归测试作为关键需求列入报告建议。不跳过。**

判断不确定时，默认要求回归测试。详见 `../references/test-review-methodology.md`「回归测试铁律」节。

### 测试评审产物（单一产物原则）

测试评审产物**直接写入** `openspec/changes/<change_id>/reviews/plan-review-report.md` 的「测试评审」章节，**不另产出 test-plan.md**。

## Section 4：性能评审

评估清单：

- N+1 查询与数据库访问模式
- 内存使用关注点
- 缓存机会
- 慢或高复杂度的代码路径
