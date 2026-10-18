import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, vulkanFirst } from './host.mjs';
import { locate } from './shared.mjs';

test('the served folder is all a page reads: no way out through .., a link or a malformed address', { skip: process.platform === 'win32' && 'links need Developer Mode on Windows' }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'of-host-'));
  const root = join(scratch, 'film');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'assets', 'a.txt'), 'mine');
  writeFileSync(join(scratch, 'secret.txt'), 'secret');
  /* a film from elsewhere can bring links to anywhere: to a file, and to a folder above it */
  symlinkSync(join(scratch, 'secret.txt'), join(root, 'assets', 'notes.txt'));
  symlinkSync(scratch, join(root, 'assets', 'up'));
  /* a link that stays inside is followed */
  symlinkSync(join(root, 'assets', 'a.txt'), join(root, 'same.txt'));
  const site = await serve(root);
  try {
    const get = async (path) => { const r = await fetch(site.url + path); return [r.status, await r.text()]; };
    assert.deepEqual(await get('/assets/a.txt'), [200, 'mine']);
    assert.deepEqual(await get('/same.txt'), [200, 'mine']);
    assert.equal((await get('/assets/notes.txt'))[0], 403);
    assert.equal((await get('/assets/up/secret.txt'))[0], 403);
    assert.notEqual((await get('/%2e%2e/secret.txt'))[1], 'secret');
    assert.notEqual((await get('/assets/..%2f..%2fsecret.txt'))[1], 'secret');
    assert.equal((await get('/%E0%A4%A'))[0], 400);
    assert.deepEqual(await get('/assets/a.txt'), [200, 'mine'], 'and it still serves');
  } finally {
    await site.close();
  }
});

test('look and render serve the film\'s project, never the folders around it', () => {
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'of-work-')));
  const film = join(work, 'forked');
  mkdirSync(join(film, 'scenes'), { recursive: true });
  writeFileSync(join(film, 'film.html'), '{"stage":{"w":16,"h":9},"tracks":[]}');
  writeFileSync(join(film, 'scenes', 'title.html'), '<!doctype html>');
  mkdirSync(join(work, 'page'));
  writeFileSync(join(work, 'page', 'index.html'), '<!doctype html>');
  writeFileSync(join(work, '.env'), 'SECRET=1');
  const was = process.cwd();
  process.chdir(work);
  try {
    /* run from a folder that holds other things (a workspace, a home folder) */
    assert.equal(locate('forked').root, film);
    assert.equal(locate('forked/scenes/title.html').root, film, 'a scene page still reaches ../ inside its project');
    assert.equal(locate('page').root, join(work, 'page'), 'a page on its own is served from its own folder');
    /* a host that names the project serves it */
    assert.equal(locate(join(film, 'scenes', 'title.html'), film).root, film);
  } finally {
    process.chdir(was);
  }
});

test('Windows: Vulkan when its renderer is a GPU, read once; otherwise the default, for every later browser too', async () => {
  /** A launcher that records what each browser was opened with; `fails` makes a Vulkan launch throw. */
  const launcher = (fails = false) => {
    const opened = /** @type {string[][]} */ ([]), closed = /** @type {string[][]} */ ([]);
    const open = async (/** @type {string[]} */ angle) => {
      opened.push(angle);
      if (fails && angle.length) throw new Error('no Vulkan driver');
      return /** @type {any} */ ({ angle, close: async () => { closed.push(angle); } });
    };
    return { open, opened, closed };
  };
  const reads = (/** @type {() => Promise<string>} */ said) => {
    let count = 0;
    return { renderer: async () => { count++; return said(); }, get count() { return count; } };
  };
  const vulkan = ['--use-angle=vulkan'];

  const gpu = reads(async () => 'ANGLE (NVIDIA, Vulkan 1.4.329 (NVIDIA GeForce RTX 5070 Laptop GPU (0x00002D58)), NVIDIA)');
  let l = launcher(), pick = vulkanFirst(gpu.renderer);
  const browsers = await Promise.all([pick(l.open), pick(l.open), pick(l.open)]);
  assert.deepEqual(browsers.map((b) => b.angle), [vulkan, vulkan, vulkan]);
  assert.equal(gpu.count, 1);
  assert.deepEqual(l.closed, []);

  for (const said of [async () => 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', async () => 'none', async () => { throw new Error('page crashed'); }]) {
    const software = reads(said);
    l = launcher(); pick = vulkanFirst(software.renderer);
    const [first, second] = await Promise.all([pick(l.open), pick(l.open)]);
    assert.deepEqual([first.angle, second.angle], [[], []]);
    assert.deepEqual(l.opened, [vulkan, [], []]);
    assert.deepEqual(l.closed, [vulkan]);
    assert.equal(software.count, 1);
  }

  const never = reads(async () => 'unused');
  l = launcher(true); pick = vulkanFirst(never.renderer);
  assert.deepEqual((await pick(l.open)).angle, []);
  assert.deepEqual((await pick(l.open)).angle, []);
  assert.deepEqual(l.opened, [vulkan, [], []]);
  assert.equal(never.count, 0);
});
