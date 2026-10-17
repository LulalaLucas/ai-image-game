import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank } from '../game.js';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
try {
  const bank = JSON.parse(await readFile(new URL('../data/questions.json', import.meta.url), 'utf8'));
  const { valid, errors } = validateBank(bank);
  for (const question of valid) {
    for (const src of [question.src]) {
      const path = resolve(root, src);
      if (!path.startsWith(root + sep)) { errors.push(`${question.id}：图片路径越界 ${src}`); continue; }
      try {
        const info = await stat(path);
        if (!info.isFile() || !info.size) errors.push(`${question.id}：图片为空或不是文件 ${src}`);
      } catch { errors.push(`${question.id}：找不到图片 ${src}`); }
    }
  }
  if (!valid.length) errors.push('至少需要一道可用题目。');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`题库检查通过：${valid.length} 道单图题，真实 ${valid.filter(q => q.label === 'real').length} 张，AI ${valid.filter(q => q.label === 'ai').length} 张${bank.demo ? '（演示模式）' : ''}。`);
} catch (error) { console.error('题库检查失败：', error.message); process.exitCode = 1; }
