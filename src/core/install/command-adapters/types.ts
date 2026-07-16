/**
 * 命令适配器接口与中间内容结构。
 */
import type { InstallScope } from '../../types.js';

/** 从 assets 命令 .md 解析后的中间结构 */
export interface CommandContent {
  /** 命令 ID（文件名不含扩展名），如 design */
  id: string;
  /** frontmatter 中的展示名 */
  name: string;
  /** 命令前缀，如 polaris */
  prefix: string;
  /** frontmatter 描述 */
  description: string;
  /** frontmatter 之后的正文 */
  body: string;
}

/** 各平台命令路径与格式适配器 */
export interface CommandAdapter {
  /** 此 adapter 负责的平台 ID */
  platformIds: string[];

  getCommandPath(
    commandId: string,
    prefix: string,
    baseDir: string,
    skillsDir: string,
    scope: InstallScope,
  ): string;

  formatCommand(content: CommandContent): string;
}
