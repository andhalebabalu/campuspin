import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // All HTTP goes through the centralized API client (src/lib/api) and the services layer,
    // never through ad-hoc fetch() calls scattered across components.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/api/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Call the API through a service in src/services (which uses src/lib/api).',
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
