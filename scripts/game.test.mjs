import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, answerQuestion, validateBank } from '../game.js';
const make = n => ({ id: `q${n}`, realImages: [`assets/q${n}/real-1.jpg`, `assets/q${n}/real-2.jpg`], aiImage: { src: `assets/q${n}/ai.jpg`, model: '测试模型' } });
const bank = Array.from({ length: 50 }, (_, i) => make(i));
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
test('从50题中抽取8题，题目不重复，每题恰好一张AI图片', () => {
  const round = createRound(bank, seeded(42));
  assert.equal(round.length, 8);
  assert.equal(new Set(round.map(q => q.id)).size, 8);
  for (const q of round) { assert.equal(q.options.length, 3); assert.equal(q.options.filter(o => o.isAI).length, 1); }
  assert.equal(bank[0].id, 'q0');
});
test('多次重置会重新抽题，并覆盖三个答案位置', () => {
  const positions = new Set();
  const samples = new Set();
  const random = seeded(231);
  for (let i = 0; i < 50; i++) {
    const round = createRound(bank, random);
    samples.add(round.map(q => q.id).join(','));
    for (const q of round) positions.add(q.options.findIndex(o => o.isAI));
  }
  assert.equal(positions.size, 3);
  assert.ok(samples.size > 45);
});
test('每题只能提交一次，随机打乱后仍准确判分', () => {
  const round = createRound(bank, seeded(52));
  for (const q of round) {
    const correct = q.options.findIndex(o => o.isAI);
    assert.equal(answerQuestion(q, correct), true);
    assert.equal(answerQuestion(q, (correct + 1) % 3), null);
    assert.equal(q.selected, correct);
  }
  const q = createRound(bank, seeded(1))[0];
  assert.equal(answerQuestion(q, -1), null);
  assert.equal(answerQuestion(q, q.options.findIndex(o => !o.isAI)), false);
});
test('不足8题、禁用题、空题库和无效配置均正确处理', () => {
  assert.equal(createRound([make(1), make(2)]).length, 2);
  assert.equal(createRound([]).length, 0);
  const invalid = { ...make(3), realImages: ['x.jpg'] };
  const { valid, errors } = validateBank({ questions: [make(1), make(1), { ...make(2), enabled: false }, invalid, { ...make(4), aiImage: { src: 'a.jpg', model: '' } }, { ...make(5), realImages: ['../x.jpg', 'y.jpg'] }] });
  assert.equal(valid.length, 1);
  assert.equal(errors.length, 4);
  assert.throws(() => validateBank({}));
  assert.equal(validateBank({ questions: [] }).valid.length, 0);
});
