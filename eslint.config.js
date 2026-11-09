import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['.output/', '.wxt/', 'node_modules/', 'coverage/', 'tests/fixtures/', 'specs/', '.claude/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // R14 / principe I : toute sortie console passe par src/shared/logger.ts.
      'no-console': 'error',
      // TypeScript already checks undefined identifiers.
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      // Formatting is left to Prettier.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Bun scripts (dump-locales, check-config...): their standard output is their interface.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/shared/logger.ts'],
    rules: { 'no-console': 'off' },
  },
);
