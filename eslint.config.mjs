// Shared ESLint config for `packages/*` and `apps/api`.
// `apps/web` has its own config (eslint-config-next) and is excluded here.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/generated/**',
    '**/.next/**',
    'apps/web/**',
    // The Expo app has its own config (eslint-config-expo).
    'apps/mobile/**',
  ]),
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Raw SQL is only allowed through Prisma's tagged templates ($queryRaw`...`), which
      // parameterise values. The *Unsafe variants concatenate strings and invite SQL injection.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^\\$(queryRaw|executeRaw)Unsafe$/]',
          message: 'Use the parameterised tagged-template form ($queryRaw`...`) instead.',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Test files: Nest/supertest responses are loosely typed by nature.
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
]);
