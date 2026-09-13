import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';

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
