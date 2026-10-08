// Vite dev server for the audio lab (project root, so /src/audio and /audio/* resolve), plus a
// small POST endpoint the render page uses to write WAV files into tools/audio-lab/out/.
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(LAB_DIR, '../..');
export const OUT_DIR = path.join(LAB_DIR, 'out');

function savePlugin() {
  return {
    name: 'audio-lab-save',
    configureServer(server) {
      server.middlewares.use('/__lab/save', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x');
        const rel = url.searchParams.get('path') ?? '';
        const dest = path.resolve(OUT_DIR, rel);
        if (req.method !== 'POST' || !rel || !dest.startsWith(OUT_DIR + path.sep)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.concat(chunks));
          res.statusCode = 200;
          res.end('ok');
        });
      });
    },
  };
}

export async function startLabServer({ port = 0 } = {}) {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    server: { port, host: '127.0.0.1', strictPort: false, hmr: false },
    plugins: [savePlugin()],
  });
  await server.listen();
  const addr = server.httpServer.address();
  const url = `http://127.0.0.1:${addr.port}/`;
  return { server, url, close: () => server.close() };
}

// `node tools/audio-lab/lib/server.mjs` -> serve the audition page
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5319);
  const { url } = await startLabServer({ port });
  console.log(`audio lab: ${url}tools/audio-lab/index.html   (render preview: ${url}tools/audio-lab/render.html)`);
}
