export const ROUND_SIZE = 6;

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function fixedPairGroups(questions) {
  const groups = new Map();
  for (const question of questions) {
    if (question.pairId == null) continue;
    if (!groups.has(question.pairId)) groups.set(question.pairId, []);
    groups.get(question.pairId).push(question);
  }
  return groups;
}

function isCompletePair(options) {
  return options.length === 2 && options.some(q => q.label === 'ai') && options.some(q => q.label === 'real');
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
    if (question.pairId != null && !isText(question.pairId)) {
      errors.push(`${name}：固定配对编号需要是非空文本。`); continue;
    }
    paths.add(question.src);
    valid.push(question);
  }
  const invalidPairs = new Set();
  for (const [pairId, options] of fixedPairGroups(valid)) {
    if (!isCompletePair(options)) {
      invalidPairs.add(pairId);
      errors.push(`固定配对 ${pairId}：需要且仅能包含一张真实照片和一张 AI 图片，已跳过整组。`);
    }
  }
  return { valid: valid.filter(q => !invalidPairs.has(q.pairId)), errors };
}

export const QUESTION_SECONDS = 10;

export function createRound(questions, random = Math.random, seenIds = new Set(), previousIds = new Set()) {
  const prioritize = items => [
    ...shuffle(items.filter(q => !seenIds.has(q.id) && !previousIds.has(q.id)), random),
    ...shuffle(items.filter(q => seenIds.has(q.id) && !previousIds.has(q.id)), random),
    ...shuffle(items.filter(q => previousIds.has(q.id)), random)
  ];
  const fixedPairs = [...fixedPairGroups(questions).values()].filter(isCompletePair);
  const unpaired = questions.filter(q => q.pairId == null);
  const ai = prioritize(unpaired.filter(q => q.label === 'ai'));
  const real = prioritize(unpaired.filter(q => q.label === 'real'));
  const freePairs = Array.from({ length: Math.min(ai.length, real.length) }, (_, i) => [ai[i], real[i]]);
  const priority = image => previousIds.has(image.id) ? 2 : seenIds.has(image.id) ? 1 : 0;
  // Treat a fixed pair as one candidate question, never as two independent images.
  // Prefer unseen pairs, then seen pairs, and use previous-round images last.
  const candidates = shuffle([...fixedPairs, ...freePairs], random).map(options => {
    const ranks = options.map(priority);
    return { options, last: Math.max(...ranks), total: ranks[0] + ranks[1] };
  });
  candidates.sort((a, b) => a.last - b.last || a.total - b.total);
  return candidates.slice(0, ROUND_SIZE).map(({ options }) => ({
    options: shuffle(options, random),
    selected: null,
    answered: false,
    correct: null,
    timedOut: false
  }));
}

export function answerQuestion(question, index) {
  if (question.answered || !Number.isInteger(index) || !question.options[index]) return null;
  question.selected = index;
  question.answered = true;
  question.correct = question.options[index].label === 'ai';
  return question.correct;
}

export function expireQuestion(question) {
  if (question.answered) return false;
  question.answered = true;
  question.selected = null;
  question.correct = false;
  question.timedOut = true;
  return true;
}
