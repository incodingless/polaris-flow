import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Dashboard 前端在浏览器运行，跳过 Node lint 规则
    ignores: ['dist/', 'node_modules/', 'bin/', 'scripts/', 'assets/', 'src/dashboard/web/'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
