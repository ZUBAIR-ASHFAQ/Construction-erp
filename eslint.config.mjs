import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    files: ['tests/**/*.{js,mjs,cjs}'],
    rules: {
      // Source-contract tests intentionally use escaped, whitespace-sensitive regexes.
      'no-regex-spaces': 'off',
      'no-useless-escape': 'off'
    }
  },
  {
    files: [
      'packages/bootstrap/src/normalize.ts',
      'packages/contracts/src/primitives.ts',
      'packages/idempotency/src/execute.ts',
      'packages/numbering/src/definition.ts',
      'packages/storage/src/key.ts'
    ],
    rules: {
      // These boundary validators deliberately reject ASCII control characters.
      'no-control-regex': 'off'
    }
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
);
