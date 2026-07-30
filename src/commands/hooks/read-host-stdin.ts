/**
 * 从 process.stdin（或注入流）读取宿主 hook JSON 并归一。
 */
import { parseHookStdinJson, type HookStdinPayload } from '../../core/hooks/hook-stdin.js';

/**
 * 将 Readable 读至 EOF 为字符串。
 */
async function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * 读取宿主 hook stdin；TTY / 读失败 → Unknown。
 */
export async function readHostHookStdin(
  stdin: NodeJS.ReadableStream = process.stdin,
  isTty: boolean = Boolean((stdin as NodeJS.ReadStream).isTTY),
): Promise<HookStdinPayload> {
  if (isTty) return { event: 'Unknown', raw: {} };
  try {
    const text = await readStreamToString(stdin);
    return parseHookStdinJson(text);
  } catch {
    return { event: 'Unknown', raw: {} };
  }
}
