import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'apps/*/dist/**',
      'coverage/**',
      'database/**',
      'logs/**',
      'paysyswin/**',
      '.agents/**',
      '.superpowers/**',
      'apps/jx-services/mount/**',
      'apps/jx-services/versions/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended
];
