import { validateBank, createRound, answerQuestion } from './game.js';

const $ = id => document.getElementById(id);
const labels = ['A', 'B', 'C'];
const state = { bank: [], round: [], index: 0, score: 0, loaded: new Set(), modalIndex: 0, zoom: 1, demo: false };
const icon = (type, className = '') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', type === 'check' ? 'm5 12 4.5 4.5L19 7' : type === 'cross' ? 'm6 6 12 12M18 6 6 18' : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6');
  svg.append(path);
  return svg;
};
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function announce(text) { $('announcement').textContent = text; }
function current() { return state.round[state.index]; }

async function loadBank() {
  try {
    const response = await fetch(new URL('./data/questions.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('题库暂时无法加载，请刷新重试。');
    const bank = await response.json();
    const { valid, errors } = validateBank(bank);
    if (!valid.length) throw new Error(errors.length ? '题库配置需要检查：' + errors.join(' ') : '题库尚未添加题目。请先接入图片和题目配置。');
    state.bank = valid;
    state.demo = bank.demo === true;
    const messages = [];
    if (state.demo) messages.push('演示模式 · 图片均为测试素材，AI 答案与模型名称为占位配置。');
    if (valid.length < 8) messages.push(`当前题库共 ${valid.length} 题，本轮展示全部可用题目。`);
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
  state.round = createRound(state.bank);
  state.index = 0;
  state.score = 0;
  $('game').hidden = false;
  $('result').hidden = true;
  $('score').textContent = '0';
  renderQuestion();
  announce(`新一轮开始，共 ${state.round.length} 题。`);
}

function renderProgress(finished = false) {
  $('progress').replaceChildren();
  state.round.forEach((question, i) => {
    const done = question.selected !== null;
    const type = done ? (question.options[question.selected].isAI ? 'correct' : 'wrong') : i === state.index && !finished ? 'current' : '';
    $('progress').append(node('span', `progress-segment ${type}`));
  });
  const count = state.round.filter(q => q.selected !== null).length;
  $('progress').setAttribute('aria-label', `已完成 ${count} / ${state.round.length} 题`);
}

function renderQuestion() {
  const question = current();
  state.loaded = new Set();
  $('game').setAttribute('aria-busy', 'true');
  $('question-number').textContent = String(state.index + 1).padStart(2, '0');
  $('question-total').textContent = `/ ${String(state.round.length).padStart(2, '0')}`;
  $('next').disabled = true;
  $('next').replaceChildren(document.createTextNode(state.index === state.round.length - 1 ? '查看结果 ' : '下一题 '), node('span', '', '→'));
  renderProgress();
  $('cards').replaceChildren(...question.options.map((option, i) => {
    const card = node('article', 'image-card');
    card.dataset.index = i;
    const picture = node('button', 'picture-button');
    picture.type = 'button';
    picture.setAttribute('aria-label', `放大查看图片 ${labels[i]}`);
    const image = node('img', 'loading');
    image.alt = `选项 ${labels[i]} 的图片`;
    image.decoding = 'async';
    image.draggable = false;
    const loading = node('span', 'image-loading', '图片加载中…');
    const expand = node('span', 'expand-icon');
    expand.append(icon('expand'));
    picture.append(image, loading, expand);
    const bottom = node('div', 'card-bottom');
    const choose = node('button', 'select-button');
    choose.type = 'button';
    choose.disabled = true;
    choose.setAttribute('aria-label', `选择 ${labels[i]} 为 AI 图片`);
    const spacer = node('span', 'option-space');
    spacer.setAttribute('aria-hidden', 'true');
    choose.append(node('span', 'option-letter', labels[i]), spacer, node('span', 'radio-mark'));
    const model = node('div', 'model-line');
    bottom.append(choose, model);
    card.append(picture, bottom);
    image.addEventListener('load', () => {
      if (current() !== question) return;
      image.classList.remove('loading');
      loading.hidden = true;
      state.loaded.add(i);
      if (state.loaded.size === 3) {
        $('game').setAttribute('aria-busy', 'false');
        if (question.selected === null) $('cards').querySelectorAll('.select-button').forEach(button => button.disabled = false);
      }
    });
    image.addEventListener('error', () => {
      if (current() !== question) return;
      state.loaded.delete(i);
      $('cards').querySelectorAll('.select-button').forEach(button => button.disabled = true);
      loading.hidden = false;
      loading.classList.add('error');
      loading.textContent = '图片加载失败，点击重试';
      picture.setAttribute('aria-label', `图片 ${labels[i]} 加载失败，点击重试`);
    });
    picture.addEventListener('click', () => {
      if (!state.loaded.has(i)) {
        loading.textContent = '图片加载中…';
        loading.classList.remove('error');
        picture.setAttribute('aria-label', `放大查看图片 ${labels[i]}`);
        const url = new URL(option.src, document.baseURI);
        url.searchParams.set('retry', Date.now());
        image.src = url.href;
      } else openImage(i);
    });
    choose.addEventListener('click', () => submitAnswer(i));
    image.src = option.src;
    return card;
  }));
  const nextQuestion = state.round[state.index + 1];
  if (nextQuestion) nextQuestion.options.forEach(option => { const image = new Image(); image.src = option.src; });
}

function submitAnswer(index) {
  if (state.loaded.size !== 3) return;
  const question = current();
  const correct = answerQuestion(question, index);
  if (correct === null) return;
  if (correct) state.score++;
  $('score').textContent = state.score;
  const answer = question.options.findIndex(option => option.isAI);
  $('cards').querySelectorAll('.image-card').forEach((card, i) => {
    const button = card.querySelector('.select-button');
    button.disabled = true;
    button.classList.add('answered');
    card.querySelector('.radio-mark')?.remove();
    if (i === answer) {
      card.classList.add('revealed');
      if (correct) card.classList.add('answer-correct');
      card.querySelector('.picture-button').append(node('span', 'ai-badge', 'AI 生成'));
      const model = card.querySelector('.model-line');
      model.append(node('span', '', '生成模型'), document.createTextNode(question.model));
      model.title = `生成模型：${question.model}`;
      model.classList.add('visible');
      button.setAttribute('aria-label', `选项 ${labels[i]}，AI 图片${i === index ? '，我的选择' : ''}`);
      if (correct) button.append(icon('check'));
    } else if (i === index) {
      card.classList.add('incorrect');
      button.setAttribute('aria-label', `选项 ${labels[i]}，真实图片，我的选择`);
      button.append(icon('cross'));
    } else card.classList.add('muted');
    if (i === index) {
      const symbol = node('span', `answer-symbol ${correct ? 'good' : 'bad'}`);
      const disc = node('span', 'symbol-disc');
      disc.append(icon(correct ? 'check' : 'cross'));
      symbol.append(disc);
      symbol.setAttribute('aria-hidden', 'true');
      card.querySelector('.picture-button').append(symbol);
      setTimeout(() => symbol.remove(), 1250);
    }
  });
  renderProgress();
  $('next').disabled = false;
  announce(`${correct ? '回答正确' : '回答错误'}。AI 图片是 ${labels[answer]}，生成模型：${question.model}。`);
  if (!correct && matchMedia('(max-width: 640px)').matches) {
    setTimeout(() => {
      if (current() === question && !$('game').hidden && !$('lightbox').open) {
        $('cards').querySelector('.revealed')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      }
    }, 650);
  }
}

function nextQuestion() {
  if (current().selected === null) return;
  if (state.index === state.round.length - 1) { showResult(); return; }
  state.index++;
  renderQuestion();
  announce(`第 ${state.index + 1} 题，共 ${state.round.length} 题。`);
  if (matchMedia('(max-width: 640px)').matches) $('game').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showResult() {
  $('game').hidden = true;
  const result = $('result');
  result.replaceChildren(node('div', 'result-overline', '本轮完成'));
  const title = node('h2', '', '你的辨识成绩');
  title.id = 'result-title';
  const score = node('div', 'result-score', String(state.score));
  score.append(node('span', '', ` / ${state.round.length}`));
  score.setAttribute('aria-label', `答对 ${state.score} 题，共 ${state.round.length} 题`);
  const again = node('button', 'primary-button', '再玩一轮');
  again.type = 'button';
  again.append(node('span', '', '↻'));
  again.addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const review = node('div', 'review-grid');
  review.setAttribute('aria-label', '本轮答案回顾');
  state.round.forEach((question, i) => {
    const correct = question.options[question.selected].isAI;
    const answer = question.options.findIndex(option => option.isAI);
    const item = node('div', `review-card ${correct ? 'good' : 'bad'}`);
    const image = node('img');
    image.src = question.options[answer].src;
    image.alt = `第 ${i + 1} 题的 AI 图片`;
    const info = node('div', 'review-info');
    info.append(node('small', '', `第 ${String(i + 1).padStart(2, '0')} 题 · ${labels[answer]}`), node('p', '', question.model));
    info.title = question.model;
    item.setAttribute('aria-label', `第 ${i + 1} 题，${correct ? '答对' : '答错'}，AI 图片为 ${labels[answer]}，生成模型：${question.model}`);
    item.append(image, info, icon(correct ? 'check' : 'cross'));
    review.append(item);
  });
  result.append(title, score, again, review);
  result.hidden = false;
  announce(`本轮完成，答对 ${state.score} / ${state.round.length} 题。`);
  again.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let fitWidth = 0;
let fitHeight = 0;
function setZoom(value) {
  state.zoom = Math.max(1, Math.min(3, value));
  const stage = $('lightbox-stage');
  stage.classList.toggle('zoomed', state.zoom > 1);
  const image = $('large-image');
  image.style.width = `${fitWidth * state.zoom}px`;
  image.style.height = `${fitHeight * state.zoom}px`;
  image.style.maxWidth = state.zoom === 1 ? '100%' : 'none';
  image.style.maxHeight = state.zoom === 1 ? '100%' : 'none';
  $('zoom-reset').textContent = `${Math.round(state.zoom * 100)}%`;
  $('zoom-out').disabled = state.zoom <= 1;
  $('zoom-in').disabled = state.zoom >= 3;
  if (state.zoom === 1) { stage.scrollTop = 0; stage.scrollLeft = 0; }
}
function fitImage() {
  const image = $('large-image');
  const stage = $('lightbox-stage');
  const styles = getComputedStyle(stage);
  const width = stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const height = stage.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight, 1);
  fitWidth = image.naturalWidth * ratio;
  fitHeight = image.naturalHeight * ratio;
  setZoom(1);
}
function openImage(index) {
  state.modalIndex = (index + 3) % 3;
  $('lightbox-title').textContent = `图片 ${labels[state.modalIndex]}`;
  $('large-image').alt = `放大查看选项 ${labels[state.modalIndex]} 的图片`;
  $('large-image').onload = fitImage;
  $('large-image').src = current().options[state.modalIndex].src;
  if (!$('lightbox').open) {
    $('lightbox').showModal();
    document.body.style.overflow = 'hidden';
  }
  if ($('large-image').complete && $('large-image').naturalWidth) fitImage();
}
$('reset').addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('next').addEventListener('click', nextQuestion);
$('close-lightbox').addEventListener('click', () => $('lightbox').close());
$('lightbox').addEventListener('close', () => { document.body.style.overflow = ''; });
$('lightbox').addEventListener('click', event => { if (event.target === $('lightbox')) { const rect = $('lightbox').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('lightbox').close(); } });
$('previous-image').addEventListener('click', () => openImage(state.modalIndex - 1));
$('next-image').addEventListener('click', () => openImage(state.modalIndex + 1));
$('zoom-in').addEventListener('click', () => setZoom(state.zoom + .5));
$('zoom-out').addEventListener('click', () => setZoom(state.zoom - .5));
$('zoom-reset').addEventListener('click', () => setZoom(1));
window.addEventListener('resize', () => { if ($('lightbox').open && $('large-image').naturalWidth) fitImage(); });
document.addEventListener('keydown', event => {
  if ($('lightbox').open) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); openImage(state.modalIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); openImage(state.modalIndex + 1); }
    return;
  }
  if ($('game').hidden || !state.round.length || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (['1', '2', '3'].includes(event.key)) submitAnswer(Number(event.key) - 1);
});
loadBank();
