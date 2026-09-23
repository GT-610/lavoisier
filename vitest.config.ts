import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Unit-test configuration.
 *
 * Deliberately separate from `vite.config.ts`: the tests cover the pure logic
 * (engine, store, catalogue, utilities) and need neither the React plugin nor
 * Tailwind, so keeping them out makes the suite start faster and removes the
 * chance that a build-tooling change breaks the tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The engine is deterministic given a fixed seed of inputs, but the store
    // is module-level state, so tests must not share a worker's module cache.
    isolate: true,
  },
})
