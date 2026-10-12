// The native projects' XML must parse: Gradle stops at a comment that contains "--" (the R32 colors.xml did, which
// broke `./gradlew assembleDebug` on 2026-10-12 although every web check passed).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function xmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['build', 'assets', 'public'].includes(entry.name) ? [] : xmlFiles(full);
    return /\.(xml|plist|storyboard)$/.test(entry.name) ? [full] : [];
  });
}

test('native XML comments never contain "--" and never end with "-"', () => {
  const files = [...xmlFiles(path.join(root, 'android/app/src/main')), ...xmlFiles(path.join(root, 'ios/App/App'))];
  assert.ok(files.some(file => file.endsWith(path.join('values', 'colors.xml'))), 'the R32 colors file is checked');
  const problems = [];
  for (const file of files) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/<!--([\s\S]*?)-->/g)) {
      if (match[1].includes('--') || match[1].endsWith('-')) problems.push(`${path.relative(root, file)}: ${match[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(problems, []);
});
