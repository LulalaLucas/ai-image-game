import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL('./check-bank.mjs', import.meta.url))], { stdio: 'inherit' });
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'game.js', 'assets', 'data']) await cp(new URL(name, root), new URL(name, dist), { recursive: true, filter: source => !source.endsWith('.DS_Store') });
// Include the imported game module in the app's version, so a new round size
// cannot reuse an older module from the browser's GitHub Pages cache.
const version = contents => createHash('sha256').update(contents).digest('hex').slice(0, 12);
const gameVersion = version(await readFile(new URL('game.js', dist)));
const app = (await readFile(new URL('app.js', dist), 'utf8')).replace("from './game.js'", `from './game.js?v=${gameVersion}'`);
if (!app.includes(`from './game.js?v=${gameVersion}'`)) throw new Error('未找到需要更新版本号的游戏模块。');
await writeFile(new URL('app.js', dist), app);
const appVersion = version(app);
const styleVersion = version(await readFile(new URL('style.css', dist)));
let html = (await readFile(new URL('index.html', dist), 'utf8'))
  .replace('src="./app.js"', `src="./app.js?v=${appVersion}"`)
  .replace('href="./style.css"', `href="./style.css?v=${styleVersion}"`);
for (const name of ['game-icon.png', 'game-icon.svg']) {
  const iconVersion = version(await readFile(new URL(`assets/${name}`, dist)));
  html = html.replace(`href="./assets/${name}"`, `href="./assets/${name}?v=${iconVersion}"`);
}
await writeFile(new URL('index.html', dist), html);
await writeFile(new URL('.nojekyll', dist), '');
console.log('静态网站已生成至 dist/，可直接部署到 GitHub Pages。');
