import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'public/sw.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'api/**/*.js',
      'server/**/*.js',
      'tests/**/*.{js,ts}',
      '*.js',
      '*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
)
