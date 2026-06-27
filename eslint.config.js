import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'cmake-build-debug/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '.*', args: 'after-used', argsIgnorePattern: '^_' }],
      camelcase: [
        'error',
        {
          properties: 'never',
        },
      ],
      semi: [0, 'never'],
      eqeqeq: [2, 'allow-null'],
      quotes: ['error', 'single'],
      'no-var': 2,
      'prefer-const': 2,
      'func-style': [0, 'declaration'],
      'comma-dangle': ['error', 'always-multiline'],
    },
  },
];
