/**
 * 前端静态资源托管：MIME 判定、路径穿越防护、SPA 兜底。
 *
 * 定位：只服务 `<包根>/dist/web/` 下的 vite 产物，由 `server.ts` 在非 `/api` 路径上调用。
 * 本模块不依赖 router，也不做任何写操作。
 */
import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

/** 前端产物会用到的 MIME 表 */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** 取扩展名对应的 Content-Type；未知扩展名回退 application/octet-stream */
export function contentTypeOf(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * 把 URL 路径解析为 webRoot 内的绝对文件路径。
 * 越界（路径穿越）、非法编码、不存在、非普通文件一律返回 null。
 */
export function resolveStaticPath(webRoot: string, urlPath: string): string | null {
  const root = path.resolve(webRoot);

  let decoded: string;
  try {
    // 非法百分号编码（如 /%zz）会抛 URIError，不能让它冒泡成 500
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }

  // 空路径与 '/' 都落到入口页
  const relPath = decoded.replace(/^\/+/, '') || 'index.html';
  const abs = path.resolve(root, relPath);

  // 路径穿越防护：解析后必须仍在 webRoot 内
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return null;
  }

  try {
    if (!statSync(abs).isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return abs;
}

/**
 * 托管静态资源。命中则写响应并返回 true；未命中返回 false，由调用方决定 404。
 *
 * SPA 兜底：没有扩展名的未命中路径回退到 `index.html`（hash router 下正常不会触发，
 * 但直接敲 `/tasks` 这类地址时更友好）。有扩展名的未命中路径不做兜底，避免把
 * 缺失的 JS 当成 HTML 返回。
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, webRoot: string): boolean {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  const url = req.url ?? '/';
  let filePath = resolveStaticPath(webRoot, url);

  if (!filePath) {
    const pathname = url.split('?')[0] ?? '/';
    if (path.extname(pathname)) {
      return false;
    }
    filePath = resolveStaticPath(webRoot, '/');
    if (!filePath) {
      return false;
    }
  }

  res.writeHead(200, {
    'Content-Type': contentTypeOf(filePath),
    // 本地工作台：改完前端立刻可见，不做缓存
    'Cache-Control': 'no-cache',
  });

  if (method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = createReadStream(filePath);
  stream.on('error', () => {
    // 文件在 stat 之后被删等竞态：响应头已发出，只能终止连接
    res.end();
  });
  stream.pipe(res);
  return true;
}
