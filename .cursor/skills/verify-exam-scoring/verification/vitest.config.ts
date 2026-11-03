import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');

export default defineConfig({
  plugins: [react()],
  root: repoRoot,
  test: {
    environment: 'node',
    include: ['.cursor/skills/verify-exam-scoring/verification/scoring.check.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      '@': repoRoot,
    },
  },
});
