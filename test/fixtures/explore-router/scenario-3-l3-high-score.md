# PRD：支付中台架构重构（L3 高清晰度）

## 业务目标
- 支付成功率从 97.5% 提升至 99.5%（90 天滚动窗口）
- 支付链路 P99 延迟从 800ms 降至 300ms
- 支持 3 个新支付渠道接入（微信、支付宝、银联）

## 排除项
- 不涉及退款流程改造（Phase 2）
- 不涉及海外支付
- 不改造商户结算模块

## 优先级：P0，2026-Q3 完成

## 目标用户
- 内部支付网关调用方（订单、会员、充值 3 个业务线）
- 运维团队（监控与告警）

## 验收标准

### 正常流程
```gherkin
Given 订单服务调用支付网关创建支付单
When 用户选择微信支付并完成
Then 5 秒内回调订单服务且状态为 PAID
And 支付流水写入 payment_records 表
```

### 异常流程（共 8 条，占比 40%）
```gherkin
Given 支付渠道超时（>10s）
When 创建支付单
Then 返回 PAY_CHANNEL_TIMEOUT 且订单状态不变

Given 重复支付回调
When 收到相同 transaction_id 的第二次回调
Then 幂等处理，不重复记账

Given 渠道证书过期
When 发起支付
Then 自动切换备用证书并告警
```

## 非功能需求
- P99 ≤ 300ms，可用性 ≥ 99.95%
- PCI-DSS 合规，敏感数据不落日志

## 影响范围
- 模块：payment-gateway、payment-router、channel-adapter（3 服务）
- 接口：12 个 REST + 2 个 MQ topic 变更
- 数据表：payment_orders（schema 变更）、payment_records（新增）、channel_config（迁移）
- 依赖团队：订单（2 人周）、运维（1 人周）、微信/支付宝商务对接

## 数据迁移
- 存量 2.3 亿条 payment_orders 双写 2 周后切流
- 回滚方案：feature flag 切回旧网关

## 技术方案
- 沿用 Java + Spring Boot，引入 Resilience4j 做熔断（团队已评审通过）
- 架构方案已在 2026-02 技术评审会通过

## 合规
- 符合 constitution 支付安全红线
- 不突破现有商户数据隔离规则
