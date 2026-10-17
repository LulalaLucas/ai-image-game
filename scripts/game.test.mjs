import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_SIZE, createRound, answerQuestion, validateBank } from '../game.js';
const make = (n, label = n % 2 ? 'ai' : 'real') => ({ id: `q${n}`, src: `assets/questions/q${n}.jpg`, label, ...(label === 'ai' ? { model: '来源标注模型' } : {}) });
const bank = Array.from({ length: 50 }, (_, i) => make(i));
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
test('每轮十张不重复图片，真假各半，保留来源但不修改题库', () => {
  const original = structuredClone(bank);
  const round = createRound(bank, seeded(42));
  assert.equal(round.length, ROUND_SIZE);
  assert.equal(new Set(round.map(q => q.id)).size, ROUND_SIZE);
  assert.equal(round.filter(q => q.label === 'ai').length, 5);
  assert.ok(round.every(q => q.selected === null && q.correct === null));
  assert.deepEqual(bank, original);
});
test('重新开始会重新抽题，真假顺序没有固定交替模式', () => {
  const samples = new Set(), sequences = new Set();
  const random = seeded(231);
  for (let i = 0; i < 50; i++) {
    const round = createRound(bank, random);
    samples.add(round.map(q => q.id).join(','));
    sequences.add(round.map(q => q.label).join(','));
  }
  assert.ok(samples.size > 45);
  assert.ok(sequences.size > 20);
});
test('连续换组优先抽未出现的图片，题库用完后也避开上一轮', () => {
  const seen = new Set();
  let previous = new Set();
  const random = seeded(725);
  for (let i = 0; i < 8; i++) {
    const round = createRound(bank, random, seen, previous);
    const ids = round.map(q => q.id);
    assert.equal(round.length, 10);
    assert.equal(round.filter(q => q.label === 'ai').length, 5);
    assert.ok(ids.every(id => !previous.has(id)), '换组不能沿用上一轮的图片');
    if (i < 5) assert.ok(ids.every(id => !seen.has(id)), '有未出现的图片时不应重复');
    ids.forEach(id => seen.add(id));
    previous = new Set(ids);
  }
  assert.equal(seen.size, 50);
});
test('即使随机数相同也能换出不同图片，而不是只改变题目顺序', () => {
  const first = createRound(bank, () => 0);
  const previous = new Set(first.map(q => q.id));
  const next = createRound(bank, () => 0, previous, previous);
  assert.ok(next.every(q => !previous.has(q.id)));
});
test('某类图片不足以两轮不重复时，仍优先使用未出现的图并维持完整题数', () => {
  const small = [...Array.from({ length: 7 }, (_, i) => make(i, 'real')),
    ...Array.from({ length: 20 }, (_, i) => make(i + 20, 'ai'))];
  const first = createRound(small, seeded(1));
  const previous = new Set(first.map(q => q.id));
  const next = createRound(small, seeded(2), previous, previous);
  assert.equal(next.length, 10);
  assert.equal(new Set(next.map(q => q.id)).size, 10);
  assert.equal(next.filter(q => previous.has(q.id)).length, 3);
});
test('真实和AI都准确判分；错误、无效输入及重复提交不会误加分', () => {
  for (const label of ['real', 'ai']) {
    const q = createRound([make(1, label)])[0];
    assert.equal(answerQuestion(q, 'invalid'), null);
    assert.equal(q.selected, null);
    assert.equal(answerQuestion(q, label), true);
    assert.equal(q.correct, true);
    assert.equal(answerQuestion(q, label), null);
    const wrong = createRound([make(2, label)])[0];
    const guess = label === 'ai' ? 'real' : 'ai';
    assert.equal(answerQuestion(wrong, guess), false);
    assert.equal(wrong.correct, false);
    assert.equal(wrong.selected, guess);
    assert.equal(answerQuestion(wrong, label), null);
  }
});
test('单一标签、少量题目和空题库正常抽取，不丢题也不补重复题', () => {
  for (const count of [0, 1, 3, 7, 20]) {
    const source = Array.from({ length: count }, (_, i) => make(i, 'real'));
    const round = createRound(source, seeded(1));
    assert.equal(round.length, Math.min(count, ROUND_SIZE));
    assert.equal(new Set(round.map(q => q.id)).size, round.length);
  }
  const unbalanced = [make(50, 'ai'), ...Array.from({ length: 20 }, (_, i) => make(i, 'real'))];
  const round = createRound(unbalanced, seeded(3));
  assert.equal(round.length, 10);
  assert.equal(round.filter(q => q.label === 'ai').length, 1);
});
test('验证单图结构、重复题目、路径越界、标签和模型类型；未知模型允许留空', () => {
  const unknownModel = { id: 'unknown', src: 'assets/questions/unknown.jpg', label: 'ai' };
  const { valid, errors } = validateBank({ questions: [make(1), make(1), { ...make(2), enabled: false },
    { ...make(3), src: '../outside.jpg' }, { ...make(4), label: 'fake' }, { ...make(5), model: 3 },
    { ...make(6), src: 'https://example.com/image.jpg' }, { ...make(7), src: make(1).src }, unknownModel] });
  assert.equal(valid.length, 2);
  assert.equal(errors.length, 6);
  assert.equal(valid[1].model, undefined);
  assert.throws(() => validateBank({}));
  assert.equal(validateBank({ questions: [] }).valid.length, 0);
});
