/**
 * `.polaris/config.yaml` 的类型定义与读写逻辑。
 * 保存全局配置，如仪表盘端口、安装时间等。 路径：.polaris/config.yaml
 */

import path from 'path';
import { readJsonObjectOrEmpty } from '../../utils/json-io.js';

/** 全局配置 */
export interface PolarisGlobalConfig {
  /** 安装时间 */
  install_time: string | Date;
  /** 版本 */
  version: string;
  /** 仪表盘端口 */
  dashboard_port?: number;
}

/**
 * 生成 init 阶段的默认全局配置（最小集，保持既有落盘格式）
 * @returns 默认全局配置
 */
export function createDefaultPolarisGlobalConfig(): PolarisGlobalConfig {
  return {
    install_time: new Date().toISOString(),
    version: '0.1.0',
  };
}

/**
 * 读取全局配置
 * @param projectPath 项目路径
 * @returns 全局配置
 */
export async function readPolarisGlobalConfig(projectPath: string): Promise<PolarisGlobalConfig> {
  const configPath = path.join(projectPath, '.polaris', 'config.yaml');
  const config = await readJsonObjectOrEmpty(configPath);
  return normalizePolarisGlobalConfig(config);
}

/**
 * 规范化全局配置
 * @param config 全局配置
 * @returns 规范化后的全局配置
 */
export function normalizePolarisGlobalConfig(config: Record<string, unknown>): PolarisGlobalConfig {
  return {
    install_time: config.install_time as string | Date,
    version: config.version as string,
    dashboard_port: config.dashboard_port as number | undefined,
  };
}
