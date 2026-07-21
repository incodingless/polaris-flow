# 文件结构参考

本文件是 Polaris 项目安装后的文件结构参考。按需查阅，不随 skill 一次性加载。

```text

your-project/
├── .trae/                           # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 技能目录
│   │   ├── polaris-flow/            # polaris-flow 主目录（因平台差异在不同平台中上的内容不同）
│   │   ├── brainstorming/           # Superpowers 技能
│   │   ├── test-driven-development/
│   │   └── ...
│   └── commands/                    # slash command 定义
│
├── .polaris/                       # polaris-flow 运行时状态
│   ├── config.yaml                 # 项目配置，记录项目共用配置
│   ├── workflow.yaml               # 工作流配置
│   ├── .gitignore                  # 文件忽略清单
│   └── tasks
│       └── <task_name>             # 任务目录
│           ├── intention.md
│           └── state.yaml          # 任务配置及状态 
│
├── openspec/                       # OpenSpec 制品 - WHAT
│   └── changes/<name>/
│       ├── proposal.md
│       ├── design.md
│       ├── specs/
│       └── tasks.md
│
├── docs/superpowers/                      # Superpowers — HOW
│   ├── specs/YYYY-MM-DD-<topic>-design.md # 设计文档（技术 RFC，归档时标注状态）
│   └── plans/YYYY-MM-DD-<feature>.md      # 实施计划（文件头含 change 关联元数据）
│
└── polaris-lock.json             # 版本锁定文件
```

** Trae平台 polaris-flow目录结构 **
> Trae平台不支持技能目录嵌套存放，只能以扁平形式存放于.trae/skills目录下。
```text
your-project/
├── .trae/                           # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 平台技能目录
│   │   ├── polaris-flow/               # polaris-flow 主目录（因平台差异在不同平台中上的内容不同）
│   │   │   ├── SKILL.md
│   │   │   ├── constitution/               # 宪法
│   │   │   ├── adapters/                   # 平台适配
│   │   │   ├── hooks/                      # hook + scorer 脚本
│   │   │   ├── scorers/                    # 量化评估规则
│   │   │   ├── policies/                   # 策略
│   │   │   ├── templates/                  # 模板文件
│   │   │   └── hard-stops.md               # 硬性停止点
│   │   └── polaris-flow-*/SKILL.md     # polaris-flow子技能
│   ├── commands/                    # 平台命令目录
│   ├── sugagents/                   # 平台子智能体目录
│   ├── rules/                       # 平台规则目录
│   └── hooks.json                   # 平台Hook
```

** Claude Code等 支持技能目录嵌套的平台 **
```text
your-project/
├── .claude/                         # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 技能目录
│   │   ├── polaris-flow/           # polaris-flow 主目录（因平台差异在不同平台中上的内容不同）
│   │   │   ├── SKILL.md
│   │   │   ├── constitution/        # 宪法
│   │   │   ├── adapters/            # 平台适配
│   │   │   ├── hooks/               # hook + scorer 脚本
│   │   │   ├── scorers/             # 量化评估规则
│   │   │   ├── policies/            # 策略
│   │   │   ├── templates/           # 模板文件
│   │   │   ├── hard-stops.md        # 硬性停止点
│   │   │   ├── clarify/             # polaris-flow子技能-澄清技能
│   │   │   │   └── SKILL.md
│   │   │   └── ...                  # polaris-flow子技能-其他子技能
│   │   └── ...                      # 其他技能
│   ├── commands/                    # 平台命令目录
│   ├── sugagents/                   # 平台子智能体目录
│   ├── rules/                       # 平台规则目录
│   └── hooks/                       # 平台Hook
```