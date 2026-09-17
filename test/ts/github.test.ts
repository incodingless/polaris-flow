/**
 * GitHub 拉取：HTTP/1.1 默认环境与镜像 URL 改写。
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getGitEnv, rewriteGithubRepoUrl } from '../../src/core/deps/github.js';

const SUPERPOWERS = 'https://github.com/obra/superpowers';

describe('rewriteGithubRepoUrl', () => {
  afterEach(() => {
    delete process.env.POLARIS_GITHUB_MIRROR;
  });

  it('无镜像时保持原 URL', () => {
    delete process.env.POLARIS_GITHUB_MIRROR;
    expect(rewriteGithubRepoUrl(SUPERPOWERS)).toBe(SUPERPOWERS);
  });

  it('镜像含 github.com 时替换主机前缀', () => {
    process.env.POLARIS_GITHUB_MIRROR = 'https://gitclone.com/github.com';
    expect(rewriteGithubRepoUrl(SUPERPOWERS)).toBe(
      'https://gitclone.com/github.com/obra/superpowers',
    );
  });

  it('镜像为网关前缀时拼接完整原 URL', () => {
    process.env.POLARIS_GITHUB_MIRROR = 'https://ghproxy.example';
    expect(rewriteGithubRepoUrl(SUPERPOWERS)).toBe(
      'https://ghproxy.example/https://github.com/obra/superpowers',
    );
  });
});

describe('getGitEnv', () => {
  afterEach(() => {
    delete process.env.GIT_HTTP_VERSION;
  });

  it('默认注入 HTTP/1.1', () => {
    delete process.env.GIT_HTTP_VERSION;
    expect(getGitEnv().GIT_HTTP_VERSION).toBe('HTTP/1.1');
  });

  it('不覆盖用户已设置的 GIT_HTTP_VERSION', () => {
    process.env.GIT_HTTP_VERSION = 'HTTP/2';
    expect(getGitEnv().GIT_HTTP_VERSION).toBe('HTTP/2');
  });
});
