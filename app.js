import { ROUND_SIZE, validateBank, createRound, answerQuestion } from './game.js';
const $ = id => document.getElementById(id);
const state = { bank: [], round: [], seenIds: new Set(), index: 0, score: 0, loaded: false, zoom: 1, demo: false };
const labelText = label => label === 'ai' ? 'AI 生成' : '真实照片';
const current = () => state.round[state.index];
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function announce(text) { $('announcement').textContent = text; }
function icon(correct) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', correct ? 'm5 12 4.5 4.5L19 7' : 'm6 6 12 12M18 6 6 18');
  svg.append(path);
  return svg;
}
function lockAnswers(locked) {
  $('answer-real').disabled = locked;
  $('answer-ai').disabled = locked;
}
async function loadBank() {
  try {
    const response = await fetch(new URL('./data/questions.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('题库暂时无法加载，请刷新重试。');
    const bank = await response.json();
    const { valid, errors } = validateBank(bank);
    if (!valid.length) throw new Error(errors.length ? '题库配置需要检查：' + errors.join(' ') : '题库尚未添加题目。');
    state.bank = valid;
    state.demo = bank.demo === true;
    const messages = [];
    if (state.demo) messages.push('演示素材，真假标签为占位配置。');
    if (valid.length < ROUND_SIZE) messages.push(`当前题库共 ${valid.length} 题，本轮展示全部题目。`);
    if (errors.length) messages.push(`已跳过 ${errors.length} 道配置异常的题目。`);
    $('notice').textContent = messages.join(' ');
    $('notice').hidden = !messages.length;
    if (errors.length) console.warn('题库检查：', errors);
    $('reset').disabled = false;
    startRound();
  } catch (error) {
    $('game').hidden = true;
    $('error').hidden = false;
    $('error').replaceChildren(node('p', '', error.message));
    const retry = node('button', 'primary-button', '重新加载');
    retry.type = 'button';
    retry.addEventListener('click', () => location.reload());
    $('error').append(retry);
  }
}
function startRound() {
  if ($('lightbox').open) $('lightbox').close();
  const previousIds = new Set(state.round.map(question => question.id));
  state.round = createRound(state.bank, Math.random, state.seenIds, previousIds);
  state.round.forEach(question => state.seenIds.add(question.id));
  state.index = 0;
  state.score = 0;
  $('game').hidden = false;
  $('result').hidden = true;
  $('score').textContent = '0';
  renderQuestion();
  announce(`新一轮开始，共 ${state.round.length} 题。`);
}
function renderProgress() {
  $('progress').replaceChildren(...state.round.map((question, i) => {
    const type = question.selected !== null ? question.correct ? 'correct' : 'wrong' : i === state.index ? 'current' : '';
    return node('span', `progress-segment ${type}`);
  }));
  $('progress').setAttribute('aria-label', `已完成 ${state.round.filter(q => q.selected !== null).length} / ${state.round.length} 题`);
}
function renderQuestion() {
  const question = current();
  state.loaded = false;
  $('game').setAttribute('aria-busy', 'true');
  $('question-number').textContent = String(state.index + 1).padStart(2, '0');
  $('question-total').textContent = `/ ${String(state.round.length).padStart(2, '0')}`;
  $('image-card').className = 'image-card';
  $('picture').querySelectorAll('.answer-symbol, .answer-badge').forEach(element => element.remove());
  $('feedback').hidden = true;
  $('feedback').replaceChildren();
  $('feedback').className = 'feedback';
  for (const id of ['answer-real', 'answer-ai']) {
    $(id).classList.remove('chosen', 'correct-choice', 'wrong-choice');
    $(id).setAttribute('aria-pressed', 'false');
  }
  lockAnswers(true);
  $('next').disabled = true;
  $('next').replaceChildren(document.createTextNode(state.index === state.round.length - 1 ? '查看结果 ' : '下一题 '), node('span', '', '→'));
  $('picture').setAttribute('aria-label', '放大查看当前图片');
  const image = $('question-image');
  const loading = $('image-loading');
  image.classList.add('loading');
  loading.hidden = false;
  loading.className = 'image-loading';
  loading.textContent = '图片加载中…';
  image.onload = () => {
    if (current() !== question) return;
    state.loaded = true;
    image.classList.remove('loading');
    loading.hidden = true;
    $('game').setAttribute('aria-busy', 'false');
    lockAnswers(question.selected !== null);
  };
  image.onerror = () => {
    if (current() !== question) return;
    state.loaded = false;
    lockAnswers(true);
    $('game').setAttribute('aria-busy', 'false');
    loading.hidden = false;
    loading.classList.add('error');
    loading.textContent = '图片加载失败，点击图片重试';
    $('picture').setAttribute('aria-label', '图片加载失败，点击重试');
  };
  image.src = question.src;
  renderProgress();
  const upcoming = state.round[state.index + 1];
  if (upcoming) { const preload = new Image(); preload.src = upcoming.src; }
}
function submitAnswer(label) {
  if (!state.loaded || $('game').hidden) return;
  const question = current();
  const correct = answerQuestion(question, label);
  if (correct === null) return;
  if (correct) state.score++;
  $('score').textContent = state.score;
  lockAnswers(true);
  const chosen = $(label === 'ai' ? 'answer-ai' : 'answer-real');
  const answer = $(question.label === 'ai' ? 'answer-ai' : 'answer-real');
  chosen.classList.add('chosen', correct ? 'correct-choice' : 'wrong-choice');
  chosen.setAttribute('aria-pressed', 'true');
  answer.classList.add('correct-choice');
  $('image-card').classList.add(correct ? 'answer-correct' : 'answer-wrong');
  $('picture').append(node('span', `answer-badge ${question.label}`, labelText(question.label)));
  const symbol = node('span', `answer-symbol ${correct ? 'good' : 'bad'}`);
  const disc = node('span', 'symbol-disc');
  disc.append(icon(correct)); symbol.append(disc);
  symbol.setAttribute('aria-hidden', 'true');
  $('picture').append(symbol);
  setTimeout(() => symbol.remove(), 1100);
  const feedback = $('feedback');
  feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
  const heading = node('div', 'feedback-heading');
  heading.append(icon(correct), node('strong', '', `${correct ? '答对了' : '答错了'} · ${question.label === 'ai' ? '这张图片由 AI 生成' : '这张图片是真实照片'}`));
  feedback.append(heading);
  feedback.hidden = false;
  renderProgress();
  $('next').disabled = false;
  $('next').focus({ preventScroll: true });
}
function nextQuestion() {
  if (!current() || current().selected === null || $('game').hidden) return;
  if (state.index === state.round.length - 1) { showResult(); return; }
  state.index++;
  renderQuestion();
  announce(`第 ${state.index + 1} 题，共 ${state.round.length} 题。`);
}
function showResult() {
  $('game').hidden = true;
  const result = $('result');
  const title = node('h2', '', `这一轮答对了 ${state.score} 题`); title.id = 'result-title';
  const score = node('div', 'result-score', String(state.score));
  score.append(node('span', '', ` / ${state.round.length}`));
  const accuracy = node('p', 'result-accuracy', `正确率 ${Math.round(state.score / state.round.length * 100)}%`);
  const again = node('button', 'primary-button', '换一组图片 ↻');
  again.type = 'button';
  again.addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const review = node('div', 'review-grid');
  review.setAttribute('aria-label', '这一轮的图片与答案');
  state.round.forEach((question, i) => {
    const item = node('article', `review-card ${question.correct ? 'good' : 'bad'}`);
    const image = node('img'); image.src = question.src; image.alt = `第 ${i + 1} 题：${labelText(question.label)}`;
    const info = node('div', 'review-info');
    info.append(node('small', '', `第 ${String(i + 1).padStart(2, '0')} 题 · ${question.correct ? '答对' : '答错'}`), node('strong', '', labelText(question.label)), node('p', '', `你选的是：${labelText(question.selected)}`));
    item.append(image, info, icon(question.correct)); review.append(item);
  });
  result.replaceChildren(node('div', 'result-overline', '这一轮结束了'), title, score, accuracy, again, review);
  result.hidden = false;
  announce(`本轮完成，答对 ${state.score} / ${state.round.length} 题。`);
  again.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
let fitWidth = 0, fitHeight = 0;
function setZoom(value) {
  state.zoom = Math.max(1, Math.min(3, value));
  const stage = $('lightbox-stage'), image = $('large-image');
  stage.classList.toggle('zoomed', state.zoom > 1);
  image.style.width = `${fitWidth * state.zoom}px`; image.style.height = `${fitHeight * state.zoom}px`;
  image.style.maxWidth = state.zoom === 1 ? '100%' : 'none'; image.style.maxHeight = state.zoom === 1 ? '100%' : 'none';
  $('zoom-reset').textContent = `${Math.round(state.zoom * 100)}%`;
  $('zoom-out').disabled = state.zoom <= 1; $('zoom-in').disabled = state.zoom >= 3;
  if (state.zoom === 1) { stage.scrollTop = 0; stage.scrollLeft = 0; }
}
function fitImage() {
  const image = $('large-image'), stage = $('lightbox-stage');
  if (!image.naturalWidth) return;
  const styles = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const height = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight, 1);
  fitWidth = image.naturalWidth * ratio; fitHeight = image.naturalHeight * ratio; setZoom(1);
}
function openImage() {
  if (!state.loaded) return;
  $('lightbox-title').textContent = `第 ${state.index + 1} 题 · 查看细节`;
  $('large-image').onload = fitImage;
  $('large-image').src = $('question-image').src;
  $('lightbox').showModal(); document.body.style.overflow = 'hidden';
  if ($('large-image').complete && $('large-image').naturalWidth) fitImage();
}
$('picture').addEventListener('click', () => {
  if (state.loaded) { openImage(); return; }
  $('image-loading').textContent = '图片加载中…'; $('image-loading').classList.remove('error');
  $('picture').setAttribute('aria-label', '放大查看当前图片');
  $('game').setAttribute('aria-busy', 'true');
  const url = new URL(current().src, document.baseURI); url.searchParams.set('retry', Date.now()); $('question-image').src = url.href;
});
$('answer-real').addEventListener('click', () => submitAnswer('real'));
$('answer-ai').addEventListener('click', () => submitAnswer('ai'));
$('reset').addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('next').addEventListener('click', nextQuestion);
$('close-lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('close', () => { document.body.style.overflow = ''; });
$('lightbox').addEventListener('click', event => {
  if (event.target !== $('lightbox')) return;
  const rect = $('lightbox').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('lightbox').close();
});
$('zoom-in').addEventListener('click', () => setZoom(state.zoom + .5));
$('zoom-out').addEventListener('click', () => setZoom(state.zoom - .5));
$('zoom-reset').addEventListener('click', () => setZoom(1));
window.addEventListener('resize', () => { if ($('lightbox').open) fitImage(); });
document.addEventListener('keydown', event => {
  if ($('lightbox').open || $('game').hidden || !state.round.length || event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (['r', '1', 'arrowleft'].includes(key)) { event.preventDefault(); submitAnswer('real'); }
  if (['a', '2', 'arrowright'].includes(key)) { event.preventDefault(); submitAnswer('ai'); }
});
loadBank();
