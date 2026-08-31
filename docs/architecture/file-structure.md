# 文件结构参考

本文件是 Polaris 项目安装后的文件结构参考。按需查阅，不随 skill 一次性加载。

```text

your-project/
├── .<platform>/                     # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 技能目录
│   │   ├── polaris/                 # polaris 技能主目录（因平台差异在不同平台中上的内容不同）
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
├── openspec/                       # OpenSpec 制品 - WHAT + HOW
│   └── changes/<name>/
│       ├── proposal.md
│       ├── design.md
│       ├── detail-design.md        # 设计文档（技术 RFC，归档时标注状态）
│       ├── specs/
│       └── tasks.md                # 实施计划，TDD任务标注
│
├── docs/           
│   └── prd                         # 产品需求文档目录
│
└── polaris-lock.json               # 版本锁定文件
```

** 不支持嵌套（扁平）的平台 polaris技能目录结构（如Trae） **
> Trae平台不支持技能目录嵌套存放，只能以扁平形式存放于.trae/skills目录下。
```text
your-project/
├── .trae/                           # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 平台技能目录
│   │   ├── polaris/                 # polaris类技能公共目录
│   │   │   ├── constitution/               # 宪法
│   │   │   ├── adapters/                   # 平台适配
│   │   │   ├── hooks/                      # hook + scorer 脚本
│   │   │   ├── scorers/                    # 量化评估规则
│   │   │   ├── policies/                   # 策略
│   │   │   └── hard-stops.md               # 硬性停止点
│   │   ├── polaris-flow-*/SKILL.md     # polaris开发类技能
│   │   ├── polaris-prd-*/SKILL.md      # polaris需求类技能
│   │   └── polaris-test-*/SKILL.md     # polaris测试类技能
│   ├── commands/                    # 平台命令目录
│   ├── sugagents/                   # 平台子智能体目录
│   ├── rules/                       # 平台规则目录
│   └── hooks.json                   # 平台Hook
```

** 支持技能目录嵌套的平台 (如 Claude Code等)**
```text
your-project/
├── .claude/                         # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 技能目录
│   │   ├── polaris/                 # polaris 主目录（因平台差异在不同平台中上的内容不同）
│   │   │   ├── SKILL.md
│   │   │   ├── constitution/        # 宪法
│   │   │   ├── adapters/            # 平台适配
│   │   │   ├── hooks/               # hook + scorer 脚本
│   │   │   ├── scorers/             # 量化评估规则
│   │   │   ├── policies/            # 策略
│   │   │   ├── hard-stops.md        # 硬性停止点
│   │   │   ├── flow                 # 开发类技能
│   │   │   │   ├── clarify/         # polaris-flow子技能-澄清技能
│   │   │   │   │   ├──policies
│   │   │   │   │   └── SKILL.md
│   │   │   │   ├── propose/
│   │   │   │   │   ├──policies
│   │   │   │   │   └── SKILL.md
│   │   │   │   └── ...              # polaris-flow子技能-其他子技能
│   │   │   ├── prd                 # 需求类技能
│   │   │   │   ├── discovery/    
│   │   │   │   │   ├──policies
│   │   │   │   │   └── SKILL.md
│   │   │   │   └── ...              # polaris-prd子技能-其他子技能
│   │   │   ├── test                 # 测试类技能
│   │   │   │   ├── ...
│   │   │   │   └── ...              # polaris-test子技能-其他技能
│   ├── commands/                    # 平台命令目录
│   ├── sugagents/                   # 平台子智能体目录
│   ├── rules/                       # 平台规则目录
│   └── hooks/                       # 平台Hook
```