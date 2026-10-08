import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: {
    // pre-bundle everything up front so the dev server never reloads mid-session
    include: ['pixi.js', 'gsap', 'gsap/PixiPlugin', 'gsap/CustomEase'],
    entries: ['index.html', 'src/**/*.ts'],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
} as never);
