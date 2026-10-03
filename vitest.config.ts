import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@history/core': fileURLToPath(new URL('./packages/history-core/src/index.ts', import.meta.url)), '@history/adapters': fileURLToPath(new URL('./packages/adapters/src/index.ts', import.meta.url)) } }, test: { include: ['tests/**/*.test.ts'], environment: 'node' } });
