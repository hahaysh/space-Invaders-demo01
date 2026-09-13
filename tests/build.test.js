import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { readFile } from 'node:fs/promises';

test('REQ-08 dependency manifest pins stable versions matching lockfile entries', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(lock.packages[''].devDependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
    assert.match(lock.packages[`node_modules/${name}`].integrity, /^sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*$/);
  }
});

test('REQ-08 source exposes no browser state globals or development-only state API', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /__ORBIT_TEST__|import\.meta\.env\.DEV|window\.[\w$]+\s*=/);
  assert.doesNotMatch(main, /\b(?:inject|snapshot|validateState)\b/);
});

test('REQ-08 production uses relative assets and excludes development hooks and documents', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const html = outputs.find((file) => file.fileName === 'index.html').source;
  assert.match(html, /(?:src|href)="\.\/assets\//);
  for (const file of outputs) {
    const text = String(file.code ?? file.source);
    assert.doesNotMatch(text, /__ORBIT_TEST__|snapshot:|inject\(next\)|https?:\/\/|cdn\./);
    assert.doesNotMatch(file.fileName, /\.md$|tests|e2e/);
  }
});
