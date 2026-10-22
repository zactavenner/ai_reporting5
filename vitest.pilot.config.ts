import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/test/pilot-readiness.test.ts', 'src/test/dashboard-token.test.ts'] } });
