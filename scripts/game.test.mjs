import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_SIZE, QUESTION_SECONDS, createRound, answerQuestion, expireQuestion, validateBank } from '../game.js';
const make = (n, label = n % 2 ? 'ai' : 'real') => ({ id: `q${n}`, src: `assets/questions/q${n}.jpg`, label });
const bank = Array.from({ length: 50 }, (_, i) => make(i));
const images = round => round.flatMap(q => q.options);
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
test('每轮五道双图题，每题一真一AI，十张图不重复且不修改题库', () => {
  const original = structuredClone(bank), round = createRound(bank, seeded(42));
  assert.equal(ROUND_SIZE, 5); assert.equal(QUESTION_SECONDS, 15); assert.equal(round.length, 5);
  assert.equal(new Set(images(round).map(q => q.id)).size, 10);
  for (const question of round) {
    assert.deepEqual(question.options.map(q => q.label).sort(), ['ai', 'real']);
    assert.equal(question.selected, null); assert.equal(question.answered, false);
  }
  assert.deepEqual(bank, original);
});
test('真假位置随机，新一轮优先抽未出现图片，耗尽后避开上一轮', () => {
  const seen = new Set(), positions = new Set(); let previous = new Set(); const random = seeded(725);
  for (let i = 0; i < 20; i++) {
    const round = createRound(bank, random, seen, previous), chosen = images(round);
    assert.equal(round.length, 5);
    assert.ok(chosen.every(q => !previous.has(q.id)));
    for (const label of ['real', 'ai']) {
      const unseen = bank.filter(q => q.label === label && !seen.has(q.id)).length;
      assert.equal(chosen.filter(q => q.label === label && !seen.has(q.id)).length, Math.min(unseen, 5));
    }
    round.forEach(q => positions.add(q.options.findIndex(option => option.label === 'ai')));
    chosen.forEach(q => seen.add(q.id)); previous = new Set(chosen.map(q => q.id));
  }
  assert.equal(seen.size, 50); assert.equal(positions.size, 2);
});
test('随机数相同也更换图片；某类库存较少时不生成同类配对或轮内重复', () => {
  const first = createRound(bank, () => 0), previous = new Set(images(first).map(q => q.id));
  assert.ok(images(createRound(bank, () => 0, previous, previous)).every(q => !previous.has(q.id)));
  const small = [...Array.from({ length: 6 }, (_, i) => make(i, 'real')), ...Array.from({ length: 20 }, (_, i) => make(i + 20, 'ai'))];
  const a = createRound(small, () => 0), ids = new Set(images(a).map(q => q.id));
  const b = createRound(small, () => 0, ids, ids);
  assert.equal(b.length, 5); assert.equal(new Set(images(b).map(q => q.id)).size, 10);
  assert.equal(images(b).filter(q => ids.has(q.id)).length, 4);
});
test('选择AI得分，选择真实不得分；无效输入及重复提交不会改动结果', () => {
  for (const target of ['real', 'ai']) {
    const question = createRound(bank, seeded(7))[0];
    for (const invalid of [-1, 2, '0', null, NaN]) assert.equal(answerQuestion(question, invalid), null);
    assert.equal(question.answered, false);
    const index = question.options.findIndex(q => q.label === target);
    assert.equal(answerQuestion(question, index), target === 'ai');
    assert.equal(question.selected, index); assert.equal(question.answered, true);
    assert.equal(answerQuestion(question, 1 - index), null); assert.equal(expireQuestion(question), false);
    assert.equal(question.correct, target === 'ai'); assert.equal(question.timedOut, false);
  }
});
test('超时计为未答对并锁定，之后的选择和重复超时不会改分', () => {
  const question = createRound(bank)[0];
  assert.equal(expireQuestion(question), true); assert.equal(question.correct, false);
  assert.equal(question.answered, true); assert.equal(question.timedOut, true); assert.equal(question.selected, null);
  assert.equal(answerQuestion(question, 0), null); assert.equal(expireQuestion(question), false);
});
test('题目数量取决于较少类别，缺少任一类别不生成题目', () => {
  assert.deepEqual(createRound([]), []); assert.deepEqual(createRound([make(0, 'real')]), []);
  const small = [make(0, 'real'), make(1, 'ai'), make(2, 'real')];
  assert.equal(createRound(small).length, 1); assert.equal(new Set(images(createRound(small)).map(q => q.id)).size, 2);
});
test('保留图片库校验，拒绝重复、越界和不合法标签', () => {
  const { valid, errors } = validateBank({ questions: [make(1), make(1), { ...make(2), enabled: false },
    { ...make(3), src: '../outside.jpg' }, { ...make(4), label: 'fake' }, { ...make(5), model: 3 },
    { ...make(6), src: 'https://example.com/image.jpg' }, { ...make(7), src: make(1).src }, make(8)] });
  assert.equal(valid.length, 2); assert.equal(errors.length, 6); assert.throws(() => validateBank({}));
});
