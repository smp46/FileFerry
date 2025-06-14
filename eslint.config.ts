import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import html from '@html-eslint/eslint-plugin';
import css from '@eslint/css';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
    extends: ['js/recommended'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.browser },
  },
  {
    ...html.configs['flat/recommended'],
    files: ['**/*.html'],
  },
  {
    files: ['**/*.css'],
    plugins: {
      css,
    },
    language: 'css/css',
    rules: {
      'css/no-duplicate-imports': 'error',
    },
  },
]);
