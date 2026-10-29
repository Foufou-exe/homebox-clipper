import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [vue(), WxtVitest()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/unit/setup-i18n.ts'],
    exclude: ['tests/build/**', 'node_modules/**'],
    globals: true,
    mockReset: true,
    restoreMocks: true,
  },
});
