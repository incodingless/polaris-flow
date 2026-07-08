# 会话级缓存读写协议

## 缓存文件

- 路径：`<repo>/.harness/.cache/agent-selection.json`
- Session ID 文件：`<repo>/.harness/.cache/sessions/$PPID.id`

## 读取流程（每次派发前必做）

```
1. 读取 .harness/.cache/sessions/$PPID.id → current_session_id
   - 文件缺失 → 生成临时 session_id 写入 sessions/$PPID.id + 输出警告
     "⚠️ sessions/$PPID.id 缺失，已生成临时 ID。建议重启会话让 session-start hook 正常运作。"

2. 读取 .harness/.cache/agent-selection.json → cache
   - 文件缺失 / JSON 不可解析 → cache = 空对象

3. 比较 cache.session_id 与 current_session_id
   - 不一致 → cache 视为空（跨会话失效）
   - 一致 → cache 有效

4. 查 cache.selections[dispatch_point_id]
   - 不存在 → 进入完整流程（扫描 + 菜单）
   - 存在且 `remember=false` → **不复用**,进入完整流程（单次选择不缓存跨调用）
   - 存在且 `remember=true` → 校验 agent 字段(三态)
     - agent 为 `"inline"` → 直接返回 `"inline"`
     - agent 为 `"default-subagent"` → 直接返回 `"default-subagent"`
     - agent 为路径(string)且文件存在 → 返回该路径
     - agent 为路径但文件不存在 → 视为"未决定",进入完整流程
```

## 写入流程

```
写入时机：用户在菜单中做出选择后，或 0 候选自动决定后

1. 读取现有 cache（可能已有其他派发点的选择）
2. 设置 cache.session_id = current_session_id
3. 设置 cache.created_at = 当前 ISO 时间
4. 设置 cache.selections[dispatch_point_id] = { agent: <path|null>, remember: <bool> }
5. 整体写回 .harness/.cache/agent-selection.json（原子覆盖）
```

## Schema

```json
{
  "session_id": "2026-05-23T13:37:00-a1b2c3",
  "created_at": "2026-05-23T13:37:00+08:00",
  "selections": {
    "<dispatch_point_id>": {
      "agent": "<relative_path_or_null>",
      "remember": true
    }
  }
}
```

## 字段语义

| 字段 | 类型 | 说明 |
|---|---|---|
| `session_id` | string | 对应 `sessions/$PPID.id`（或 fallback `.session_id`）文件内容 |
| `created_at` | string | ISO 8601 带时区 |
| `selections` | object | key = 派发点 ID |
| `selections[id].agent` | string | 三态之一:`"inline"`(主代理 inline 执行) / `"default-subagent"`(主代理派发默认 subagent) / 相对 repo 根的 agent 文件路径(正斜杠) |
| `selections[id].remember` | boolean | true = 本会话不再问此派发点 |

## 文件存在性校验

cache 中 `agent` 字段为字符串路径(非 `"inline"` / `"default-subagent"` 这两个保留值)时,必须校验该文件在磁盘上存在:
- 存在 → 返回路径
- 不存在 → 视该派发点为"未决定",重新进入完整流程

`agent` 为保留值 `"inline"` 或 `"default-subagent"` 时**不做文件检查**,直接返回。

## 原子写入

使用"写临时文件 → rename"模式避免中途崩溃导致 JSON 损坏：
```bash
tmp="$cache_file.tmp.$$"
echo "$json" > "$tmp"
mv "$tmp" "$cache_file"
```
