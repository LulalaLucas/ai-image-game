import { validateBank } from '../game.js';
const $ = id => document.getElementById(id);
const PAGE_SIZE = 30;
let questions = [], page = 0;
const previews = new Map();
const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const status = text => $('status').textContent = text;
function clearPreviews() { for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear(); }
function textField(title, value, change) {
  const label = el('label', 'text-field', title);
  const input = el('input'); input.type = 'text'; input.value = value || '';
  input.addEventListener('input', () => change(input.value.trim()));
  label.append(input); return label;
}
function render() {
  const filter = $('search').value.trim().toLowerCase();
  const visible = questions.filter(q => `${q.id} ${q.source?.site || ''} ${q.model || ''}`.toLowerCase().includes(filter));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  $('questions').replaceChildren();
  $('empty').hidden = visible.length > 0;
  $('export').disabled = !questions.length;
  $('page-label').textContent = `共 ${questions.length} 题 · 匹配 ${visible.length} 题 · 第 ${page + 1} / ${pages} 页`;
  $('previous').disabled = page === 0; $('following').disabled = page >= pages - 1;
  visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(question => {
    const row = el('section', 'editor-question'), top = el('div', 'question-top');
    top.append(textField('题目编号', question.id, value => question.id = value));
    const enabledLabel = el('label', 'enabled');
    const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = question.enabled !== false;
    enabled.addEventListener('change', () => question.enabled = enabled.checked);
    enabledLabel.append(enabled, document.createTextNode('启用'));
    const remove = el('button', 'remove', '移除'); remove.type = 'button';
    remove.addEventListener('click', () => { questions.splice(questions.indexOf(question), 1); render(); });
    top.append(enabledLabel, remove);
    const fields = el('div', 'fields'), image = el('img', 'preview');
    image.alt = '图片预览'; image.loading = 'lazy';
    const updateImage = () => {
      image.hidden = !question.src;
      image.src = previews.get(question.src) || (question.src ? new URL('../' + question.src, location.href).href : '');
    };
    image.addEventListener('error', () => image.hidden = true); updateImage();
    const inputs = el('div', 'image-fields');
    inputs.append(textField('图片路径', question.src, value => { question.src = value; updateImage(); }));
    const label = el('label', 'text-field', '真假标签'), select = el('select');
    for (const [value, text] of [['real', '真实照片'], ['ai', 'AI 生成']]) {
      const option = el('option', '', text); option.value = value; select.append(option);
    }
    select.value = question.label || 'real';
    select.addEventListener('change', () => question.label = select.value); label.append(select);
    inputs.append(label, textField('生成模型（未知可留空）', question.model, value => { if (value) question.model = value; else delete question.model; }));
    fields.append(image, inputs);
    const source = el('div', 'source-fields');
    for (const [key, name] of [['site', '题目来源'], ['url', '来源网址'], ['originalUrl', '原图出处'], ['author', '摄影作者']]) {
      source.append(textField(name, question.source?.[key], value => { question.source ||= {}; question.source[key] = value; }));
    }
    row.append(top, fields, source); $('questions').append(row);
  });
}
function acceptBank(bank) {
  if (!Array.isArray(bank.questions)) throw new Error('配置需要包含 questions 数组。');
  if (bank.questions.some(q => !q || typeof q.src !== 'string' || !['real', 'ai'].includes(q.label))) throw new Error('请导入新版单图题库，每题需要 src 和 real / ai 标签。');
  clearPreviews(); questions = structuredClone(bank.questions); page = 0; render();
  status(`已导入 ${questions.length} 道单图题。${bank.demo ? '当前为演示配置。' : ''}`);
}
$('load-current').addEventListener('click', async () => {
  try { const response = await fetch('../data/questions.json', { cache: 'no-cache' }); if (!response.ok) throw new Error('题库读取失败。'); acceptBank(await response.json()); }
  catch (error) { status(error.message); }
});
$('folder-button').addEventListener('click', () => $('folder-input').click());
$('json-button').addEventListener('click', () => $('json-input').click());
$('folder-input').addEventListener('change', async event => {
  const groups = new Map();
  for (const file of event.target.files) {
    const parts = file.webkitRelativePath.split('/');
    if (parts.length !== 3 || parts.some(part => part.startsWith('.'))) continue;
    const [, id, name] = parts;
    if (!/^(real|ai)\.(jpg|jpeg|png|webp|avif)$/i.test(name) && name !== 'model.txt') continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(file);
  }
  if (!groups.size) { status('请选择 questions 文件夹，每道题一个子文件夹，放一张 real.jpg 或 ai.jpg。'); return; }
  clearPreviews(); const imported = [], warnings = [];
  for (const [id, files] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const images = files.filter(file => /^(real|ai)\.(jpg|jpeg|png|webp|avif)$/i.test(file.name));
    if (images.length !== 1) { warnings.push(`${id}：每题需要且只能有一张 real 或 ai 图片，已跳过。`); continue; }
    const file = images[0], src = `assets/questions/${id}/${file.name}`;
    const question = { id, src, label: /^ai\./i.test(file.name) ? 'ai' : 'real', enabled: true };
    const model = files.find(file => file.name === 'model.txt');
    if (model) question.model = (await model.text()).trim();
    previews.set(src, URL.createObjectURL(file)); imported.push(question);
  }
  questions = imported; page = 0; render();
  status(`已导入 ${questions.length} 道单图题。\n${warnings.join('\n')}`); event.target.value = '';
});
$('json-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { acceptBank(JSON.parse(await file.text())); } catch (error) { status('导入失败：' + error.message); }
  event.target.value = '';
});
$('search').addEventListener('input', () => { page = 0; render(); });
$('previous').addEventListener('click', () => { page--; render(); });
$('following').addEventListener('click', () => { page++; render(); });
$('add').addEventListener('click', () => {
  let number = questions.length + 1;
  while (questions.some(q => q.id === `q${String(number).padStart(3, '0')}`)) number++;
  const id = `q${String(number).padStart(3, '0')}`;
  questions.unshift({ id, src: `assets/questions/${id}/real.jpg`, label: 'real', enabled: true });
  $('search').value = ''; page = 0; render(); status('已添加题目，请确认图片路径和真假标签。');
});
$('export').addEventListener('click', () => {
  const bank = { version: 2, demo: false, questions };
  const { valid, errors } = validateBank(bank);
  if (!valid.length || errors.length) { status('请先修正：\n' + (errors.join('\n') || '至少需要一道启用题目。')); return; }
  if (valid.some(q => q.src.startsWith('assets/demo/') || q.model?.includes('占位'))) { status('请先替换演示素材和占位模型。'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(bank, null, 2) + '\n'], { type: 'application/json' }));
  const a = el('a'); a.href = url; a.download = 'questions.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(`已导出 ${valid.length} 道启用题目，请替换 data/questions.json 后运行 npm run check。`);
});
render();
