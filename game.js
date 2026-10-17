export const ROUND_SIZE = 10;

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function validateBank(bank) {
  if (!bank || !Array.isArray(bank.questions)) throw new Error('题库需要包含 questions 数组。');
  const ids = new Set();
  const paths = new Set();
  const errors = [];
  const valid = [];
  const isText = value => typeof value === 'string' && value.trim().length > 0;
  const safePath = value => isText(value) && !/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(value) && !value.split(/[\\/]/).includes('..');
  for (const [index, question] of bank.questions.entries()) {
    if (question?.enabled === false) continue;
    const name = question?.id || `第 ${index + 1} 题`;
    if (!question || !isText(question.id) || ids.has(question.id)) {
      errors.push(`${name}：编号为空或重复。`); continue;
    }
    ids.add(question.id);
    if (!safePath(question.src) || !['real', 'ai'].includes(question.label)) {
      errors.push(`${name}：需要一张本地图片（src）以及 real 或 ai 标签。`); continue;
    }
    if (paths.has(question.src)) {
      errors.push(`${name}：图片重复。`); continue;
    }
    if (question.model != null && typeof question.model !== 'string') {
      errors.push(`${name}：模型名称需要是文本，未公开时可省略。`); continue;
    }
    paths.add(question.src);
    valid.push(question);
  }
  return { valid, errors };
}

export function createRound(questions, random = Math.random, seenIds = new Set(), previousIds = new Set()) {
  const size = Math.min(ROUND_SIZE, questions.length);
  const prioritize = items => [
    ...shuffle(items.filter(q => !seenIds.has(q.id) && !previousIds.has(q.id)), random),
    ...shuffle(items.filter(q => seenIds.has(q.id) && !previousIds.has(q.id)), random),
    ...shuffle(items.filter(q => previousIds.has(q.id)), random)
  ];
  const ai = prioritize(questions.filter(q => q.label === 'ai'));
  const real = prioritize(questions.filter(q => q.label === 'real'));
  const targetAI = Math.floor(size / 2) + (size % 2 && random() < .5 ? 1 : 0);
  const selected = [...ai.slice(0, targetAI), ...real.slice(0, size - targetAI)];
  if (selected.length < size) {
    const ids = new Set(selected.map(q => q.id));
    selected.push(...prioritize(questions.filter(q => !ids.has(q.id))).slice(0, size - selected.length));
  }
  return shuffle(selected, random).map(question => ({ ...question, selected: null, correct: null }));
}

export function answerQuestion(question, label) {
  if (question.selected !== null || !['real', 'ai'].includes(label)) return null;
  question.selected = label;
  question.correct = question.label === label;
  return question.correct;
}
