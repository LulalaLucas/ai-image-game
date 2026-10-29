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

test('固定搭配只能同题出现，标签保持正确且左右位置随机', () => {
  const fixed = [{ ...make(100, 'ai'), pairId: 'pair-1' }, { ...make(101, 'real'), pairId: 'pair-1' }];
  const mixed = [...bank.slice(0, 16), ...fixed], random = seeded(135);
  const original = structuredClone(mixed), positions = new Set(); let appearances = 0, absences = 0;
  for (let i = 0; i < 300; i++) {
    const round = createRound(mixed, random);
    assert.equal(round.length, 5); assert.equal(new Set(images(round).map(q => q.id)).size, 10);
    const containing = round.filter(q => q.options.some(image => image.pairId === 'pair-1'));
    assert.ok(containing.length <= 1);
    if (!containing.length) { absences++; continue; }
    const options = containing[0].options; appearances++;
    assert.deepEqual(options.map(q => q.id).sort(), ['q100', 'q101']);
    assert.deepEqual(options.map(q => q.label).sort(), ['ai', 'real']);
    positions.add(options.findIndex(q => q.label === 'ai'));
  }
  assert.ok(appearances > 0); assert.ok(absences > 0); assert.equal(positions.size, 2); assert.deepEqual(mixed, original);
});

test('固定搭配按整组参与未见图片和上一轮回避，不会被拆开补普通题', () => {
  const fixed = [{ ...make(100, 'ai'), pairId: 'pair-1' }, { ...make(101, 'real'), pairId: 'pair-1' }];
  const fixedIds = new Set(fixed.map(q => q.id)), seen = new Set(bank.map(q => q.id));
  assert.ok(createRound([...bank, ...fixed], seeded(7), seen).some(q => q.options.every(image => image.pairId === 'pair-1')));
  assert.ok(images(createRound([...bank, ...fixed], seeded(7), fixedIds, fixedIds)).every(q => !fixedIds.has(q.id)));
  const only = createRound([...fixed, make(102, 'ai')], seeded(7));
  assert.equal(only.length, 1); assert.deepEqual(only[0].options.map(q => q.id).sort(), ['q100', 'q101']);
  assert.deepEqual(createRound([{ ...make(103, 'real'), pairId: 'orphan' }, make(104, 'ai')]), []);
});

test('完整配对独立组成题目，多组固定搭配之间不混配', () => {
  const paired = Array.from({ length: 6 }, (_, i) => [{ ...make(100 + i * 2, 'ai'), pairId: `pair-${i}` }, { ...make(101 + i * 2, 'real'), pairId: `pair-${i}` }]).flat();
  const round = createRound(paired, seeded(7)); assert.equal(round.length, 5);
  assert.equal(new Set(images(round).map(q => q.id)).size, 10);
  round.forEach(q => { assert.equal(q.options[0].pairId, q.options[1].pairId); assert.deepEqual(q.options.map(v => v.label).sort(), ['ai', 'real']); });
});

test('配对缺失、标签不平衡、超过两张或配对编号无效时跳过整组', () => {
  const entries = [make(1), make(2), { ...make(10, 'ai'), pairId: 'valid' }, { ...make(11, 'real'), pairId: 'valid' },
    { ...make(12, 'ai'), pairId: 'orphan' }, { ...make(13, 'ai'), pairId: 'same-label' }, { ...make(14, 'ai'), pairId: 'same-label' },
    { ...make(15, 'ai'), pairId: 'three' }, { ...make(16, 'real'), pairId: 'three' }, { ...make(17, 'real'), pairId: 'three' },
    { ...make(18, 'ai'), pairId: 'disabled' }, { ...make(19, 'real'), pairId: 'disabled', enabled: false },
    { ...make(20, 'real'), pairId: '' }, { ...make(21, 'real'), pairId: 1 }];
  const {valid, errors} = validateBank({ questions: entries });
  assert.deepEqual(valid.map(q => q.id), ['q1', 'q2', 'q10', 'q11']); assert.equal(errors.length, 6);
});
