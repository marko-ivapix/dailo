// R53: voice input in Quick Add where the browser recognizes speech (Web Speech API); the phone apps keep the
// keyboard's own dictation key. Serbian recognition may answer in Cyrillic, which becomes Latin like the rest of the UI.
// Spec: docs/superpowers/specs/2026-10-12-r53-dictation.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

test('Cyrillic becomes Latin, digraphs included; Latin and other text stay', () => {
  assert.equal(Core.cyrillicToLatin('Купи млеко у Ђурђевој улици, Љубо, Џеп и Њива сутра у 18h'), 'Kupi mleko u Đurđevoj ulici, Ljubo, Džep i Njiva sutra u 18h');
  assert.equal(Core.cyrillicToLatin('ЉУБА'), 'LjUBA');
  assert.equal(Core.cyrillicToLatin('Već latinica #posao !visok'), 'Već latinica #posao !visok');
});

function harness() {
  const calls = [];
  const field = { value: 'Kupi', events: [], dispatchEvent(event) { this.events.push(event.type); }, focus() { calls.push('focus'); } };
  const button = { classes: new Set(), attrs: {}, classList: { toggle(name, on) { if (on) button.classes.add(name); else button.classes.delete(name); } }, setAttribute(name, value) { button.attrs[name] = value; } };
  class FakeRecognition {
    constructor() { FakeRecognition.last = this; }
    start() { calls.push(['start', this.lang, this.interimResults, this.continuous]); }
    stop() { calls.push('stop'); }
    abort() { calls.push('abort'); }
  }
  const context = withI18n({
    Core, SpeechRecognitionImpl: FakeRecognition, dictation: null,
    $: selector => (selector === '#quick-title' ? field : selector === '#quick-dictation' ? button : null),
    Event: class { constructor(type) { this.type = type; } },
    setToastMessage: message => calls.push(['toast', message]),
  });
  context.I18n = { locale: () => 'sr-Latn-RS' }; // the app's Serbian locale
  vm.createContext(context);
  vm.runInContext(`const DICTATION_ERRORS = ${app.match(/const DICTATION_ERRORS = (\{[^\n]+\});/)[1]};\n${fn('toggleDictation')}${fn('setDictationState')}${fn('stopDictation')}`, context);
  return { context, calls, field, button, recognition: () => FakeRecognition.last };
}

test('the microphone: a tap listens in Serbian, the words join the title live, a second tap stops', () => {
  const h = harness();
  h.context.toggleDictation();
  assert.deepEqual(h.calls.shift(), ['start', 'sr-RS', true, false]);
  assert.ok(h.button.classes.has('is-listening'));
  assert.equal(h.button.attrs['aria-pressed'], 'true');
  const recognition = h.recognition();
  recognition.onresult({ results: [[{ transcript: 'млеко и ' }], [{ transcript: 'хлеб' }]] });
  assert.equal(h.field.value, 'Kupi mleko i hleb');
  assert.deepEqual(h.field.events, ['input'], 'the preview of dates and tags follows');
  h.context.toggleDictation();
  assert.deepEqual(h.calls.splice(0), ['stop']);
  recognition.onend();
  assert.equal(vm.runInContext('dictation', h.context), null);
  assert.ok(!h.button.classes.has('is-listening'));
  assert.deepEqual(h.calls.splice(0), ['focus']);
});

test('errors say what happened; closing Quick Add stops listening', () => {
  const h = harness();
  h.context.toggleDictation();
  h.calls.splice(0);
  h.recognition().onerror({ error: 'not-allowed' });
  h.recognition().onerror({ error: 'aborted' });
  assert.deepEqual(h.calls.splice(0), [['toast', 'The microphone is not allowed. Allow it in the browser settings.']]);
  h.context.stopDictation();
  assert.deepEqual(h.calls.splice(0), ['abort']);
  assert.match(fn('closeModal'), /stopDictation\(\);/);
});

test('the button is there only where the browser recognizes speech', () => {
  assert.match(app, /const SpeechRecognitionImpl = globalThis\.SpeechRecognition \|\| globalThis\.webkitSpeechRecognition \|\| null;/);
  assert.match(app, /const dictate = SpeechRecognitionImpl \? `<button id="quick-dictation" class="btn-icon quick-dictation" type="button" data-action="quick-dictate" aria-pressed="false" aria-label="\$\{tr\('Dictate the task'\)\}"><i class="ph ph-microphone" aria-hidden="true"><\/i><\/button>` : '';/);
  assert.match(app, /\$\{dictate \? `<div class="quick-title-row">\$\{titleInput\}\$\{dictate\}<\/div>` : titleInput\}/);
  assert.match(app, /else if \(action === 'quick-dictate'\) toggleDictation\(\);/);
  assert.match(read('css/styles.css'), /\.quick-dictation\.is-listening \{/);
  assert.match(read('privatnost.html'), /Glasovni unos/);
});

test('Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Dictate the task', 'Izgovori zadatak'], ['Stop dictation', 'Zaustavi diktiranje'], ['Nothing was heard. Try again.', 'Ništa se nije čulo. Pokušaj ponovo.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R53 is released as 2.0.0-alpha.80', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.80');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.80';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.80');
});
