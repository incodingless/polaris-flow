/**
 * VS Code 调试入口：同进程注入 Trae SessionStart stdin，便于断点打到 dist/src。
 *
 * launch.json → 本文件 → createHostHookHandler（sourceMap 映射回 src/）。
 *
 * 用法（也可命令行）：
 *   POLARIS_HOOK_DEBUG=1 node test/shell/vscode-trae-session-start.mjs
 *   node test/shell/vscode-trae-session-start.mjs /path/to/project
 */
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const projectPath = path.resolve(process.argv[2] || root);

const sessionId = `trae-session-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
const payload = {
  session_id: sessionId,
  hook_event_name: 'SessionStart',
  source: 'startup',
};

process.env.POLARIS_HOOK_DEBUG ??= '1';

console.error('[vscode-trae-session-start] project =', projectPath);
console.error('[vscode-trae-session-start] stdin  =', JSON.stringify(payload, null, 2));

const { createHostHookHandler } = await import(
  pathToFileURL(path.join(root, 'dist/commands/hooks/handler/host-hook-handler.js')).href
);
const { sessionStartEventHandler } = await import(
  pathToFileURL(path.join(root, 'dist/commands/hooks/session-start.js')).href
);

const dispatcher = createHostHookHandler([sessionStartEventHandler]);
const stdin = Readable.from([JSON.stringify(payload)]);

await dispatcher.handle(
  {
    platform: 'trae',
    projectPath,
    fallbackEvent: 'SessionStart',
  },
  { stdin, isTty: false },
);

process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0);
