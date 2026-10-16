import { validateBank } from '../game.js';
const $ = id => document.getElementById(id);
let questions = [];
const previews = new Map();
const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
function status(text) { $('status').textContent = text; }
function clearPreviews() { for (const url of previews.values()) URL.revokeObjectURL(url); previews.clear(); }
function render() {
  $('questions').replaceChildren();
  $('empty').hidden = questions.length > 0;
  $('export').disabled = !questions.length;
  questions.forEach((question, index) => {
    const row = el('section', 'editor-question');
    const top = el('div', 'question-top');
    const idLabel = el('label', '', '题目编号 ');
    const id = el('input'); id.type = 'text'; id.value = question.id;
    id.addEventListener('input', () => question.id = id.value.trim());
    idLabel.append(id);
    const enabledLabel = el('label', 'enabled');
    const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = question.enabled !== false;
    enabled.addEventListener('change', () => question.enabled = enabled.checked);
    enabledLabel.append(enabled, document.createTextNode('启用'));
    const remove = el('button', 'remove', '移除'); remove.type = 'button'; remove.setAttribute('aria-label', `移除 ${question.id}`);
    remove.addEventListener('click', () => { questions.splice(index, 1); render(); status(`当前共 ${questions.length} 道题。`); });
    top.append(idLabel, enabledLabel, remove);
    const fields = el('div', 'fields');
    for (let i = 0; i < 3; i++) {
      const field = el('div', 'field');
      const label = el('label', '', ['真实图片 1', '真实图片 2', 'AI 图片'][i]);
      const input = el('input'); input.type = 'text'; input.value = i < 2 ? question.realImages[i] || '' : question.aiImage.src || '';
      input.id = `path-${index}-${i}`; label.htmlFor = input.id;
      const image = el('img', 'preview'); image.alt = label.textContent + '预览';
      const updateImage = () => { image.src = previews.get(input.value) || (input.value ? new URL('../' + input.value, location.href).href : ''); image.hidden = !input.value; };
      image.addEventListener('error', () => image.hidden = true);
      input.addEventListener('input', () => { if (i < 2) question.realImages[i] = input.value.trim(); else question.aiImage.src = input.value.trim(); updateImage(); });
      updateImage(); field.append(label, image, input); fields.append(field);
    }
    const modelBox = el('div', 'model-input');
    const label = el('label', '', '生成模型'); const model = el('input'); model.type = 'text'; model.placeholder = '例如：实际使用的模型及版本'; model.value = question.aiImage.model || '';
    model.id = `model-${index}`; label.htmlFor = model.id;
    model.addEventListener('input', () => question.aiImage.model = model.value.trim());
    modelBox.append(label, model); row.append(top, fields, modelBox); $('questions').append(row);
  });
}
$('folder-button').addEventListener('click', () => $('folder-input').click());
$('json-button').addEventListener('click', () => $('json-input').click());
$('folder-input').addEventListener('change', async event => {
  const files = [...event.target.files];
  if (!files.length) return;
  const groups = new Map();
  for (const file of files) {
    const parts = file.webkitRelativePath.split('/');
    if (parts.length !== 3 || parts.some(part => part.startsWith('.'))) continue;
    const [, id, name] = parts;
    if (!/^(real-1|real-2|ai)\.(jpg|jpeg|png|webp|avif)$/i.test(name) && name !== 'model.txt') continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(file);
  }
  if (!groups.size) { status('没有识别到题目。请选择包含 q001 等题目子文件夹的 questions 文件夹，并按说明命名图片。'); event.target.value = ''; return; }
  clearPreviews();
  const imported = [];
  const warnings = [];
  for (const [id, group] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const find = stem => group.filter(file => new RegExp(`^${stem}\\.(jpg|jpeg|png|webp|avif)$`, 'i').test(file.name));
    const real1 = find('real-1'); const real2 = find('real-2'); const ai = find('ai');
    if ([real1, real2, ai].some(matches => matches.length !== 1)) { warnings.push(`${id}：图片缺失或同名图片有多个格式，已跳过。`); continue; }
    const path = file => `assets/questions/${id}/${file.name}`;
    const modelFile = group.find(file => file.name === 'model.txt');
    const model = modelFile ? (await modelFile.text()).trim() : '';
    for (const file of [real1[0], real2[0], ai[0]]) previews.set(path(file), URL.createObjectURL(file));
    imported.push({ id, realImages: [path(real1[0]), path(real2[0])], aiImage: { src: path(ai[0]), model }, enabled: true });
  }
  if (!imported.length) { status(warnings.join('\n') || '没有完整的题目。'); event.target.value = ''; return; }
  questions = imported; render();
  const missing = imported.filter(q => !q.aiImage.model).length;
  status(`已导入 ${questions.length} 道题。${missing ? `请补全 ${missing} 道题的生成模型。` : '模型名称已就绪，可以导出。'}${warnings.length ? '\n' + warnings.join('\n') : ''}`);
  event.target.value = '';
});
$('json-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const bank = JSON.parse(await file.text());
    if (!Array.isArray(bank.questions)) throw new Error('配置需要包含 questions 数组。');
    const normalized = bank.questions.map(q => ({ id: String(q.id || ''), realImages: Array.isArray(q.realImages) ? q.realImages.slice(0, 2) : ['', ''], aiImage: { src: q.aiImage?.src || '', model: q.aiImage?.model || '' }, enabled: q.enabled !== false }));
    clearPreviews(); questions = normalized; render();
    status(`已导入 ${questions.length} 道题。${bank.demo ? '这是演示配置；导出正式配置前，请替换图片和模型名称。' : ''}`);
  } catch (error) { status('导入失败：' + error.message); }
  event.target.value = '';
});
$('add').addEventListener('click', () => {
  let number = questions.length + 1;
  while (questions.some(q => q.id === `q${String(number).padStart(3, '0')}`)) number++;
  const id = `q${String(number).padStart(3, '0')}`;
  questions.push({ id, realImages: [`assets/questions/${id}/real-1.jpg`, `assets/questions/${id}/real-2.jpg`], aiImage: { src: `assets/questions/${id}/ai.jpg`, model: '' }, enabled: true });
  render(); status('已添加题目，请确认图片路径并填写生成模型。');
});
$('export').addEventListener('click', () => {
  const bank = { demo: false, questions };
  const { valid, errors } = validateBank(bank);
  if (!valid.length || errors.length) { status('请先修正以下内容：\n' + (errors.join('\n') || '至少需要一道启用的题目。')); return; }
  if (valid.some(q => q.aiImage.model.includes('占位') || q.realImages.some(src => src.startsWith('assets/demo/')) || q.aiImage.src.startsWith('assets/demo/'))) { status('检测到演示素材或占位模型。请先替换为正式图片及模型名称，再导出正式题库。'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(bank, null, 2) + '\n'], { type: 'application/json' }));
  const a = el('a'); a.href = url; a.download = 'questions.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(`已导出 ${valid.length} 道启用题目。请将下载文件替换到 data/questions.json，并运行 npm run check 检查图片文件。`);
});
