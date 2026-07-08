# Phase 5 — 意图概要

**不是** implementation 细节；那是后续 `design.md` 阶段。

## 按复杂度

- **simple：** 一段意图概要；**一次**批准
- **standard：** 按节展示（架构、组件、数据流、错误处理、测试思路）；每节批准后继续
- **complex：** 同上，篇幅可达 200–300 字/节

## 隔离原则

单元职责清晰、接口明确；可独立理解与测试。

## 范围

超大范围 → 触发 `needs_split`，勿在本 change 硬塞。

## 回退

暴露**新**模糊点 → 仅针对新点回 Phase 1。

## 输出

`intent-outline-sections` — 用户已批准的内容。
