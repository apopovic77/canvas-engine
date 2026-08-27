const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  configureCanvasEngine,
  getCanvasEngineConfig,
  resetCanvasEngineConfig,
} = require('../.test-dist/config/AppConfig.js');
const {
  buildMediaUrl,
} = require('../.test-dist/utils/MediaUrlBuilder.js');

test.afterEach(() => {
  resetCanvasEngineConfig();
});

test('uses a same-origin media proxy by default', () => {
  assert.equal(getCanvasEngineConfig().storageApiUrl, '');
  assert.equal(
    buildMediaUrl({ storageId: 42, width: 320 }),
    '/proxy.php?id=42&width=320&format=webp&quality=85',
  );
});

test('uses the tenant media proxy configured by the consumer', () => {
  configureCanvasEngine({
    storageApiUrl: 'https://storage.tenant.example/',
    mediaProxyUrl: 'https://media.tenant.example/proxy?tenant=acme',
    media: { useTrimmedImages: true },
  });

  assert.deepEqual(getCanvasEngineConfig(), {
    storageApiUrl: 'https://storage.tenant.example',
    mediaProxyUrl: 'https://media.tenant.example/proxy?tenant=acme',
    media: { useTrimmedImages: true },
  });
  assert.equal(
    buildMediaUrl({ storageId: 7, format: 'png' }),
    'https://media.tenant.example/proxy?tenant=acme&id=7&format=png&quality=85&trim=true',
  );
});

test('does not add image quality to video URLs', () => {
  assert.equal(
    buildMediaUrl({ storageId: 9, format: 'mp4' }),
    '/proxy.php?id=9&format=mp4',
  );
});

test('published sources contain no operator media hosts', () => {
  const sourceRoot = path.resolve(__dirname, '../src');
  const forbidden = [
    'share' + '.arkturian.com',
    'api-storage' + '.arkturian.com',
  ];
  const files = [];

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(entryPath);
    }
  };
  visit(sourceRoot);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const host of forbidden) {
      assert.equal(source.includes(host), false, `${host} found in ${file}`);
    }
  }
});
