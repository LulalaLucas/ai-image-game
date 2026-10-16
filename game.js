export const ROUND_SIZE = 8;

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
  const errors = [];
  const valid = [];
  const isText = value => typeof value === 'string' && value.trim().length > 0;
  const safePath = value => isText(value) && !/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(value) && !value.split(/[\\/]/).includes('..');
  for (const [index, question] of bank.questions.entries()) {
    if (question?.enabled === false) continue;
    const label = question?.id || `第 ${index + 1} 题`;
    if (!question || !isText(question.id) || ids.has(question.id)) {
      errors.push(`${label}：编号为空或重复。`); continue;
    }
    ids.add(question.id);
    if (!Array.isArray(question.realImages) || question.realImages.length !== 2 || !question.realImages.every(safePath) || !safePath(question.aiImage?.src) || !isText(question.aiImage?.model)) {
      errors.push(`${label}：需要两张真实图片、一张 AI 图片及生成模型名称，图片使用相对路径。`); continue;
    }
    if (new Set([...question.realImages, question.aiImage.src]).size !== 3) {
      errors.push(`${label}：同一题的三张图片路径必须不同。`); continue;
    }
    valid.push(question);
  }
  return { valid, errors };
}

export function createRound(questions, random = Math.random) {
  return shuffle(questions, random).slice(0, ROUND_SIZE).map(question => ({
    id: question.id,
    model: question.aiImage.model,
    options: shuffle([
      ...question.realImages.map(src => ({ src, isAI: false })),
      { src: question.aiImage.src, isAI: true }
    ], random),
    selected: null
  }));
}

export function answerQuestion(question, index) {
  if (question.selected !== null || !Number.isInteger(index) || !question.options[index]) return null;
  question.selected = index;
  return question.options[index].isAI;
}
