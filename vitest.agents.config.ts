import { defineConfig } from 'vitest/config';

/** External-agent delivery rules (pure core, node env). Run: npx vitest run --config vitest.agents.config.ts */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/external-agents.test.ts'],
  },
});
