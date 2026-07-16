/**
 * 安装作用域与技能语言等共享类型。
 * InstallScope 仅从此文件导出，禁止在 platform 等模块再导出。
 */

/** 安装作用域：全局用户目录 vs 当前项目 */
export type InstallScope = 'global' | 'project';

/** 技能包语言 */
export type Language = 'en' | 'zh';
