import { join } from 'node:path';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';

export function listConfigs(projectRoot: string) {
  const results: { path: string; name: string; mtime: string }[] = [];

  function pushFile(relativePath: string, fileName: string) {
    const fullPath = join(projectRoot, relativePath);
    if (!existsSync(fullPath)) return;
    const mtime = statSync(fullPath).mtime.toISOString();
    results.push({ path: relativePath, name: fileName, mtime });
  }

  if (existsSync(join(projectRoot, 'openspec', 'polaris.yaml'))) {
    pushFile('openspec/polaris.yaml', 'polaris.yaml');
  }

  const schemasDir = join(projectRoot, 'openspec', 'schemas');
  if (existsSync(schemasDir)) {
    for (const entry of readdirSync(schemasDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const dir = join(schemasDir, entry.name);
        const files = readdirSync(dir, { recursive: true }) as string[];
        for (const file of files) {
          if (/\.(yaml|yml|md)$/.test(file)) {
            const relativePath = `openspec/schemas/${entry.name}/${file}`;
            pushFile(relativePath, file);
          }
        }
      }
    }
  }

  return results;
}

export function getConfig(projectRoot: string, configPath: string) {
  const fullPath = join(projectRoot, configPath);
  if (!existsSync(fullPath)) {
    return { error: 'File not found' };
  }

  const content = readFileSync(fullPath, 'utf8');
  const isYaml = configPath.endsWith('.yaml') || configPath.endsWith('.yml');

  return {
    path: configPath,
    content,
    syntax: isYaml ? 'yaml' : 'markdown',
  };
}

// saveConfig 刻意不提供：它是绕过 .polaris/.locks/ 的直写（设计文档 §5.1）。
// 面板在 M1/M2 为只读；配置编辑由编辑器承担。
