/** 安装作用域：global → 用户主目录；project → 当前项目（叶类型，避免与 config 循环依赖） */
export type InstallScope = 'global' | 'project';

/** 安装模式：copy → 复制；symlink → 符号链接 */
export type InstallMode = 'copy' | 'symlink';
