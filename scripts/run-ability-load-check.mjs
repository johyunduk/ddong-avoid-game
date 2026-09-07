/**
 * ability-load-check 러너.
 *
 * vite 로 `scripts/ability-load-check.ts` 를 node 용으로 번들하면서 `phaser` 를
 * 계측용 스텁으로 갈아끼운 뒤 실행한다. (Phaser 본체는 DOM 이 필요해 node 에서 못 뜬다)
 *
 *   node scripts/run-ability-load-check.mjs
 */
import { build } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, '.ability-load-out');

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { phaser: path.join(here, 'fx-leak-stub-phaser.mjs') } },
  build: {
    ssr: path.join(here, 'ability-load-check.ts'),
    outDir,
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'ability-load-check.mjs', format: 'es' } },
  },
});

const child = spawn(process.execPath, [path.join(outDir, 'ability-load-check.mjs')], { stdio: 'inherit' });
child.on('exit', code => {
  rmSync(outDir, { recursive: true, force: true });
  process.exit(code ?? 1);
});
