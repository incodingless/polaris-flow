# 文件结构参考

本文件是 Polaris 项目安装后的文件结构参考。按需查阅，不随 skill 一次性加载。

```text

your-project/
├── .trae/                           # 平台配置目录（按 polaris init 选择的平台）
│   ├── skills/                      # 技能目录
│   │   ├── polaris-flow/            # polaris-flow 主目录
│   │   │   ├── skills/              # 各阶段 skill（含 policies/references）
│   │   │   ├── constitution/        # 宪法
│   │   │   ├── adapters/            # 平台适配
│   │   │   ├── hooks/               # hook + scorer 脚本
│   │   │   ├── scorers/             # 量化评估规则
│   │   │   ├── policies/            # 策略
│   │   │   ├── templates/           # 模板文件
│   │   │   └── hard-stops.md        # 硬性停止点
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

## config.yaml
> 由polaris init 初始化时生成，作为项目配置，项目内所有任务均继承这些配置项
```
# 全局目录
global_dir: ~/.polaris
workspace_dir: ~/.ploaris/workspace

# 语言: en | zh-CN
language: zh-CN

# 平台: trae | claude | qoder | codebuddy
platform: trae

# 插件目录, <repo_root>/<platform_config>/skills/polaris-flow
plugin_root:

# 模式: solo | team
mode: solo

coding.model:

artifact-review-model.model:

scorer.model: 
scorer.token_threshold: 500

code-review.model:
challenger.model:

# context_compression: off | beta
context-compression: off

# review_mode: off | standard | thorough
review-mode: standard

```
