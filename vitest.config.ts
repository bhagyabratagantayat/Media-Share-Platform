import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/media_share_platform?schema=public',
      AUTH_SECRET: 'test-auth-secret-key-must-be-at-least-32-chars-long-media-share',
      SESSION_SECRET: 'test-session-secret-key-must-be-at-least-32-chars-long-media',
      APP_URL: 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
