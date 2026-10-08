// Headless browser launch shared by render.mjs, qa.mjs and smoke.mjs.
//
// Chromium: uses CHROMIUM_PATH, else the preinstalled /opt/pw-browsers/chromium when present, else
// Playwright's own download. Runs on SwiftShader (no GPU / Metal needed), autoplay allowed.
// WebKit is optional: `launchWebkit()` resolves to null when it is not installed.
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium';

export const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
];

export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync(DEFAULT_CHROMIUM) ? DEFAULT_CHROMIUM : undefined;
}

export function launchChromium(extraArgs = []) {
  return chromium.launch({ executablePath: chromiumPath(), args: [...CHROMIUM_ARGS, ...extraArgs] });
}

export async function launchWebkit() {
  try {
    return await webkit.launch();
  } catch (e) {
    console.warn(`[browser] WebKit not available, skipping it (${String(e.message ?? e).split('\n')[0]})`);
    return null;
  }
}
