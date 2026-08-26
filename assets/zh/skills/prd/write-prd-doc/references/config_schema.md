# 配置文件说明（prd-config）

技能通过一份配置文件设定**文档生成位置**与**归档位置**，以及其他运行参数。配置可用
YAML（推荐）或 JSON。相对路径相对于配置文件所在目录解析为绝对路径，缺失的目录会在
`config_manager.py load` 时自动创建。

## 字段定义

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `workspace` | 是 | — | **文档生成位置**：每个需求在此目录下以独立子目录隔离 |
| `archive` | 是 | — | **归档位置**：评审通过后的终稿复制于此（`<archive>/<需求id>/`） |
| `requirement_library` | 否 | 无 | 需求文档库路径，`clarify` 阶段查阅其中的领域资料 |
| `language` | 否 | `zh-CN` | 文档默认语言 |
| `generate_prototype` | 否 | `false` | 是否在流程末尾自动执行 `prototype` 阶段 |
| `prototype_format` | 否 | `html` | 原型格式（当前支持 `html`） |
| `config_version` | 否 | `1` | 配置版本，便于后续兼容 |

## 查找顺序

若未显式指定配置文件，技能会向上递归查找以下文件名：
`prd-config.yaml` → `prd-config.yml` → `prd-config.json`。

## 示例（YAML）

```yaml
# 产品需求技能配置文件
workspace: ./requirements-workspace   # 文档生成位置（需求工作区）
archive: ./requirements-archive       # 归档位置
requirement_library: ./requirements-library  # 需求文档库（澄清阶段查阅）
language: zh-CN
generate_prototype: false
prototype_format: html
```

## 目录隔离示意

```
requirements-workspace/          # workspace（生成位置）
  ├── req-login/                 # 需求 A（按 id 隔离）
  │   ├── .prd-state.json        # 阶段进度跟踪
  │   ├── user_story.md
  │   ├── clarifications.md
  │   ├── prd_draft.md
  │   ├── prd_detail.md
  │   ├── prd_final.md
  │   ├── review_report.md
  │   └── prototype/             # 可选
  └── req-pay/                   # 需求 B（互相隔离）
requirements-archive/            # archive（归档位置）
  ├── req-login/                 # 终稿归档副本
  └── req-pay/
```
