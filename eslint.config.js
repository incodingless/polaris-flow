import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 前端在仓库根的 dashboard/（不属 src/），lint 脚本本就只扫 src/，无需在此列 ignore
    ignores: ['dist/', 'node_modules/', 'bin/', 'scripts/', 'assets/'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
