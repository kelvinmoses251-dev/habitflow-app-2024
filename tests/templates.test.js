// Run with: node --test tests/templates.test.js
// The habit ideas library: every template must be something the habit sheet itself would accept.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const mod = name => import(pathToFileURL(path.join(__dirname, '..', name)).href);

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const CATEGORIES = [...app.slice(app.indexOf('const CATS = {'), app.indexOf('};', app.indexOf('const CATS = {'))).matchAll(/^\s+(\w+):\s+\{ label/gm)].map(m => m[1]);
const ICONS = [...app.slice(app.indexOf('const HABIT_ICONS = '), app.indexOf('];', app.indexOf('const HABIT_ICONS = '))).matchAll(/'([a-z-]+)'/g)].map(m => m[1]).filter(k => k !== 'cat-');

test('the app\'s categories and icons could be read (or this file checks nothing)', () => {
  assert.equal(CATEGORIES.length, 11);
  assert.ok(ICONS.includes('drop') && ICONS.includes('award'));
});

test('there are about fifty templates and every goal has a good handful', async () => {
  const { TEMPLATES, TEMPLATE_GOALS } = await mod('templates.js');
  assert.ok(TEMPLATES.length >= 48 && TEMPLATES.length <= 60, String(TEMPLATES.length));
  assert.equal(TEMPLATE_GOALS.length, 8);
  for (const g of TEMPLATE_GOALS) assert.ok(TEMPLATES.filter(t => t.goals.includes(g)).length >= 6, g);
});

test('every template is a habit the sheet would accept', async () => {
  const { TEMPLATES, TEMPLATE_GOALS, templateFrequency } = await mod('templates.js');
  const rules = await mod('habit-rules.js');
  const names = new Set();
  for (const t of TEMPLATES) {
    const at = JSON.stringify(t.name);
    assert.ok(typeof t.name === 'string' && t.name.trim() === t.name && t.name.length >= 3 && t.name.length <= 60, at);
    assert.ok(!names.has(t.name.toLowerCase()), 'duplicate ' + at); names.add(t.name.toLowerCase());
    assert.ok(CATEGORIES.includes(t.category), at + ' category ' + t.category);
    if ('icon' in t) assert.ok(ICONS.includes(t.icon), at + ' icon ' + t.icon);
    if ('cue' in t) assert.ok(t.cue.trim() === t.cue && t.cue.length > 0 && t.cue.length <= 80, at + ' cue');
    if ('timeOfDay' in t) assert.ok(['morning', 'afternoon', 'evening'].includes(t.timeOfDay), at + ' time of day');
    if ('target' in t) {
      assert.deepEqual(rules.targetOf(t), t.target, at + ' target');                      // nothing clamped, trimmed or defaulted
      assert.ok(t.target.unit.length >= 1, at + ' unit');
      assert.ok(Number.isInteger(t.target.amount / t.target.step), at + ' steps do not land on the goal');
    }
    const freq = templateFrequency(t);
    if ('schedule' in t) {
      assert.deepEqual(rules.normalizeSchedule(t.schedule, freq), t.schedule, at + ' schedule');
      assert.notEqual(t.frequency, 'monthly', at);
    }
    if ('frequency' in t) assert.equal(t.frequency, 'monthly', at);                        // the only one written out
    assert.ok(Array.isArray(t.goals) && t.goals.length >= 1 && t.goals.every(g => TEMPLATE_GOALS.includes(g)), at + ' goals');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(t)), at + ' has an emoji');
    assert.deepEqual(Object.keys(t).filter(k => !['name', 'category', 'icon', 'schedule', 'target', 'cue', 'timeOfDay', 'frequency', 'goals'].includes(k)), [], at + ' unknown field');
  }
});

test('search folds case, accents and punctuation, and needs every word', async () => {
  const { searchTemplates, fold, TEMPLATES } = await mod('templates.js');
  assert.equal(fold('  Café  au-lait! '), 'cafe au lait');
  assert.equal(searchTemplates('').length, TEMPLATES.length);
  assert.ok(searchTemplates('WATER').some(t => t.name === 'Drink water'));
  assert.ok(searchTemplates('wáter').some(t => t.name === 'Drink water'));
  assert.ok(searchTemplates('push ups').some(t => t.name === 'Push-ups'));
  assert.ok(searchTemplates('pages').some(t => t.name === 'Read'));                        // by unit
  assert.ok(searchTemplates('coffee').some(t => t.name === 'Stretch'));                    // by cue
  assert.deepEqual(searchTemplates('water zebra'), []);
  assert.deepEqual(searchTemplates('zzzz'), []);
  assert.ok(searchTemplates('<script>').length === 0 || true);                             // never throws
});

test('a goal narrows the list, alone or with a search', async () => {
  const { searchTemplates, TEMPLATES } = await mod('templates.js');
  const money = searchTemplates('', 'Money');
  assert.ok(money.length >= 6 && money.every(t => t.goals.includes('Money')));
  assert.ok(searchTemplates('lunch', 'Money').length === 1);
  assert.deepEqual(searchTemplates('lunch', 'Fitness'), []);
  assert.equal(searchTemplates('', 'No such goal').length, 0);
  assert.equal(searchTemplates('', '').length, TEMPLATES.length);
});
