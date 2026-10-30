import { ROUND_SIZE, QUESTION_SECONDS, validateBank, createRound, answerQuestion, expireQuestion } from './game.js';
const $ = id => document.getElementById(id);
const state = { bank: [], round: [], seenIds: new Set(), index: 0, score: 0, loaded: false, imagesReady: [false, false], zoom: 1, deadline: 0, timerId: null, advanceId: null, renderToken: 0 };
const current = () => state.round[state.index];
const letter = index => index === 0 ? 'A' : 'B';
const labelText = label => label === 'ai' ? 'AI 生成' : '真实照片';
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function announce(text) { $('announcement').textContent = text; }
function lockAnswers(locked) {
  for (const index of [0, 1]) {
    $(`answer-${index}`).disabled = locked;
    $(`picture-${index}`).disabled = locked;
  }
}
function stopAdvance() { clearTimeout(state.advanceId); state.advanceId = null; }
function stopTimer() { clearInterval(state.timerId); state.timerId = null; }
function updateTimer() {
  if (!current() || current().answered || !state.deadline) return;
  const remaining = Math.max(0, state.deadline - performance.now());
  $('timer').textContent = Math.ceil(remaining / 1000);
  $('timer-fill').style.width = `${remaining / (QUESTION_SECONDS * 1000) * 100}%`;
  $('timer-panel').classList.toggle('urgent', remaining <= 3000);
  if (remaining <= 0) finishAnswer(null);
}
function startTimer() {
  if (state.timerId !== null || current().answered) return;
  state.deadline = performance.now() + QUESTION_SECONDS * 1000;
  $('timer-status').textContent = '选出 AI 生成的图片';
  updateTimer();
  state.timerId = setInterval(updateTimer, 100);
  announce(`第 ${state.index + 1} 题，两张图片已加载，请在 ${QUESTION_SECONDS} 秒内选出 AI 生成的图片。`);
}
async function loadBank() {
  try {
    const response = await fetch(new URL('./data/questions.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('题库暂时无法加载，请刷新重试。');
    const { valid, errors } = validateBank(await response.json());
    const pairs = Math.min(valid.filter(q => q.label === 'ai').length, valid.filter(q => q.label === 'real').length);
    if (!pairs) throw new Error('题库需要同时包含真实照片和 AI 生成图片。');
    state.bank = valid;
    const messages = [];
    if (pairs < ROUND_SIZE) messages.push(`当前图片可组成 ${pairs} 题，本轮展示全部题目。`);
    if (errors.length) messages.push(`已跳过 ${errors.length} 张配置异常的图片。`);
    $('notice').textContent = messages.join(' ');
    $('notice').hidden = !messages.length;
    $('reset').disabled = false;
    startRound();
  } catch (error) {
    stopTimer();
    $('game').hidden = true;
    $('error').hidden = false;
    $('error').replaceChildren(node('p', '', error.message));
    const retry = node('button', 'primary-button', '重新加载');
    retry.type = 'button'; retry.addEventListener('click', () => location.reload());
    $('error').append(retry);
  }
}
function startRound() {
  stopTimer(); stopAdvance();
  if ($('lightbox').open) $('lightbox').close();
  const previousIds = new Set(state.round.flatMap(q => q.options.map(image => image.id)));
  state.round = createRound(state.bank, Math.random, state.seenIds, previousIds);
  state.round.forEach(q => q.options.forEach(image => state.seenIds.add(image.id)));
  state.index = 0; state.score = 0;
  $('game').hidden = false; $('result').hidden = true; $('score').textContent = '0';
  renderQuestion();
}
function renderProgress() {
  $('progress').replaceChildren(...state.round.map((q, i) => node('span', `progress-segment ${q.answered ? q.correct ? 'correct' : 'wrong' : i === state.index ? 'current' : ''}`)));
  $('progress').setAttribute('aria-label', `已完成 ${state.round.filter(q => q.answered).length} / ${state.round.length} 题`);
}
function renderQuestion() {
  stopTimer(); stopAdvance();
  if ($('lightbox').open) $('lightbox').close();
  state.deadline = 0; state.loaded = false; state.imagesReady = [false, false];
  const question = current(), token = ++state.renderToken;
  $('game').setAttribute('aria-busy', 'true');
  $('question-number').textContent = String(state.index + 1).padStart(2, '0');
  $('question-total').textContent = `/ ${String(state.round.length).padStart(2, '0')}`;
  $('feedback').hidden = true; $('feedback').replaceChildren();
  $('timer').textContent = QUESTION_SECONDS;
  $('timer-status').textContent = '图片加载后开始计时';
  $('timer-fill').style.width = '100%'; $('timer-panel').classList.remove('urgent');
  lockAnswers(true); $('advance-notice').hidden = true;
  question.options.forEach((option, index) => {
    $(`option-card-${index}`).className = 'option-card';
    const button = $(`answer-${index}`);
    button.className = 'choice-button'; button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `选择图片 ${letter(index)} 为 AI 生成`);
    button.replaceChildren(node('span', 'choice-letter', letter(index)), node('span', '', '选这张'), node('small', '', index === 0 ? '← / 1' : '→ / 2'));
    const picture = $(`picture-${index}`), image = $(`question-image-${index}`), loading = $(`image-loading-${index}`);
    picture.disabled = true; picture.setAttribute('aria-label', `选择图片 ${letter(index)} 为 AI 生成`);
    $(`expand-${index}`).disabled = true;
    picture.querySelectorAll('.answer-badge, .reveal-mark').forEach(badge => badge.remove());
    image.classList.add('loading'); loading.hidden = false; loading.className = 'image-loading'; loading.textContent = '图片加载中…';
    image.onload = async () => {
      try { await image.decode(); }
      catch {
        if (token === state.renderToken && current() === question) image.onerror();
        return;
      }
      if (token !== state.renderToken || current() !== question) return;
      state.imagesReady[index] = true;
      image.classList.remove('loading'); loading.hidden = true;
      picture.setAttribute('aria-label', `选择图片 ${letter(index)} 为 AI 生成`);
      $(`expand-${index}`).disabled = false;
      if (state.imagesReady.every(Boolean) && !question.answered) {
        state.loaded = true; $('game').setAttribute('aria-busy', 'false'); lockAnswers(false); startTimer();
      }
    };
    image.onerror = () => {
      if (token !== state.renderToken || current() !== question) return;
      state.imagesReady[index] = false; state.loaded = false; stopTimer(); state.deadline = 0;
      $(`expand-${index}`).disabled = true;
      lockAnswers(true); $('game').setAttribute('aria-busy', 'false');
      $('timer-status').textContent = '图片加载失败，重试后开始计时';
      loading.hidden = false; loading.classList.add('error'); loading.textContent = '加载失败，点击重试';
      picture.disabled = false; picture.setAttribute('aria-label', `图片 ${letter(index)} 加载失败，点击重试`);
    };
    image.src = option.src;
  });
  renderProgress();
  const upcoming = state.round[state.index + 1];
  if (upcoming) upcoming.options.forEach(option => { const preload = new Image(); preload.src = option.src; });
}
function submitAnswer(index) {
  if (!state.loaded || $('game').hidden || current().answered) return;
  // Enforce the deadline here too: background tabs can delay interval callbacks.
  finishAnswer(performance.now() >= state.deadline ? null : index);
}
function finishAnswer(index) {
  const question = current();
  if (!question || question.answered || $('game').hidden) return;
  if (index === null) { if (!expireQuestion(question)) return; }
  else if (answerQuestion(question, index) === null) return;
  stopTimer();
  if (question.correct) state.score++;
  $('score').textContent = state.score; lockAnswers(true);
  if (question.timedOut) {
    $('timer').textContent = '0'; $('timer-fill').style.width = '0%';
    if ($('lightbox').open) $('lightbox').close();
  }
  $('timer-status').textContent = question.timedOut ? '时间到' : '已作答';
  const aiIndex = question.options.findIndex(option => option.label === 'ai');
  question.options.forEach((option, i) => {
    const chosen = question.selected === i;
    const button = $(`answer-${i}`), card = $(`option-card-${i}`);
    button.setAttribute('aria-pressed', String(chosen));
    button.classList.toggle('chosen', chosen);
    const isAI = option.label === 'ai';
    if (isAI || chosen) {
      const verdict = isAI ? 'correct-choice' : 'wrong-choice';
      card.classList.add(verdict, 'reveal-answer'); button.classList.add(verdict);
    }
    if (chosen || (question.timedOut && isAI)) {
      const mark = node('span', `reveal-mark ${isAI ? 'good' : 'bad'}`);
      mark.setAttribute('aria-hidden', 'true');
      const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      symbol.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(symbol.namespaceURI, 'path');
      path.setAttribute('d', isAI ? 'm5 12 4.5 4.5L19 7' : 'm6 6 12 12M18 6 6 18');
      symbol.append(path); mark.append(symbol); $(`picture-${i}`).append(mark);
    }
    button.children[1].textContent = chosen ? '你的选择' : option.label === 'ai' ? '正确答案' : '真实照片';
    const badgeVerdict = isAI ? 'good' : chosen ? 'bad' : 'neutral';
    $(`picture-${i}`).append(node('span', `answer-badge ${badgeVerdict}`, labelText(option.label)));
  });
  const feedback = $('feedback');
  feedback.className = `feedback ${question.correct ? 'good' : 'bad'}`;
  const prefix = question.timedOut ? '时间到，本题未得分' : question.correct ? '答对了' : '答错了';
  const message = `${prefix} · ${letter(aiIndex)} 是 AI 生成图片`;
  feedback.replaceChildren(node('strong', 'feedback-heading', message)); feedback.hidden = false;
  renderProgress();
  const isLast = state.index === state.round.length - 1;
  $('advance-notice').textContent = isLast ? '1.5 秒后自动查看结果' : '1.5 秒后自动进入下一题';
  $('advance-notice').hidden = false;
  announce(message);
  stopAdvance();
  const token = state.renderToken;
  state.advanceId = setTimeout(() => {
    if (current() === question && state.renderToken === token && !$('game').hidden) nextQuestion();
  }, 1500);
}
function nextQuestion() {
  if (!current()?.answered || $('game').hidden) return;
  if (state.index === state.round.length - 1) { showResult(); return; }
  state.index++; renderQuestion();
}
function showResult() {
  stopTimer(); stopAdvance();
  if ($('lightbox').open) $('lightbox').close();
  $('game').hidden = true;
  const result = $('result');
  const title = node('h2', '', `恭喜你一共答对了${state.score}题`); title.id = 'result-title';
  const score = node('div', 'result-score', String(state.score)); score.append(node('span', '', ` / ${state.round.length}`));
  const accuracy = node('p', 'result-accuracy', `正确率 ${Math.round(state.score / state.round.length * 100)}%`);
  const reward = state.score >= 4 ? '可获得两个章' : state.score >= 1 ? '可获得一个章' : '';
  const rewardNotice = reward ? [node('p', 'result-reward', reward)] : [];
  const again = node('button', 'primary-button', '换一组图片 ↻'); again.type = 'button';
  again.addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const review = node('div', 'review-grid'); review.setAttribute('aria-label', '本轮答题回顾');
  state.round.forEach((question, i) => {
    const item = node('article', `review-pair ${question.correct ? 'good' : 'bad'}`);
    const outcome = question.timedOut ? '超时未答' : question.correct ? '答对' : '答错';
    item.append(node('h3', '', `第 ${i + 1} 题 · ${outcome}`));
    const images = node('div', 'review-images');
    question.options.forEach((option, index) => {
      const selected = question.selected === index;
      const figure = node('figure', `${selected ? 'selected' : ''} ${option.label === 'ai' ? 'answer-image' : selected ? 'wrong-selection' : ''}`);
      const image = node('img'); image.src = option.src; image.alt = `第 ${i + 1} 题 ${letter(index)}：${labelText(option.label)}`;
      figure.append(image, node('figcaption', '', `${letter(index)} · ${labelText(option.label)}${question.selected === index ? '（你选的）' : ''}`));
      images.append(figure);
    });
    item.append(images); review.append(item);
  });
  result.replaceChildren(node('div', 'result-overline', '这一轮结束了'), title, score, ...rewardNotice, accuracy, again, review);
  result.hidden = false; announce(`本轮完成，答对 ${state.score} / ${state.round.length} 题。${reward}`);
  again.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' });
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
function openImage(index) {
  if (!state.imagesReady[index]) return;
  $('lightbox-title').textContent = `第 ${state.index + 1} 题 · 图片 ${letter(index)}`;
  $('large-image').onload = fitImage; $('large-image').src = $(`question-image-${index}`).src;
  $('lightbox').showModal(); document.body.style.overflow = 'hidden';
  if ($('large-image').complete && $('large-image').naturalWidth) fitImage();
}
for (const index of [0, 1]) {
  $(`picture-${index}`).addEventListener('click', () => {
    if (state.imagesReady[index]) { submitAnswer(index); return; }
    const image = $(`question-image-${index}`), loading = $(`image-loading-${index}`);
    loading.textContent = '图片加载中…'; loading.classList.remove('error'); $(`picture-${index}`).disabled = true;
    $('game').setAttribute('aria-busy', 'true');
    const url = new URL(current().options[index].src, document.baseURI); url.searchParams.set('retry', Date.now()); image.src = url.href;
  });
  $(`answer-${index}`).addEventListener('click', () => submitAnswer(index));
  $(`expand-${index}`).addEventListener('click', () => openImage(index));
}
$('reset').addEventListener('click', () => { startRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimer(); });
document.addEventListener('keydown', event => {
  if ($('lightbox').open || $('game').hidden || !state.round.length || event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (['a', '1', 'arrowleft'].includes(key)) { event.preventDefault(); submitAnswer(0); }
  if (['b', '2', 'arrowright'].includes(key)) { event.preventDefault(); submitAnswer(1); }
});
loadBank();
