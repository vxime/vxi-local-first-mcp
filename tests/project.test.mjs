import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, symlink, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import { publicProjection, inspectWorkspace, recordCheck } from '../src/project.mjs';
import { handleRequest, toolNames } from '../src/mcp.mjs';

const fixture = fileURLToPath(new URL('../fixtures/synthetic-project', import.meta.url));

test('projects never disclose source, names, secrets or root paths', async () => {
  const p = await publicProjection(fixture, { stateHome: path.join(os.tmpdir(), 'vxi-nonexistent-state-home') });
  const text = JSON.stringify(p);
  assert.equal(p.code_exported, false);
  assert.equal(p.review_scope, 'METADATA_ONLY');
  for (const forbidden of ['NEVER_A_REAL_CREDENTIAL', 'FAKE_SECRET_FOR_TESTS', 'index.js', '.env', fixture, 'function add']) {
    assert.ok(!text.includes(forbidden), `Unexpected disclosure: ${forbidden}`);
  }
  assert.equal(p.files.source, 1);
  assert.equal(p.files.test, 1);
  assert.equal(p.files.docs, 1);
});

test('an ephemeral local .env is not exported to MCP status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vxi-sensitive-fixture-'));
  try {
    await writeFile(path.join(root, '.env'), 'FAKE_LOCAL_PRIVATE_TOKEN=DO_NOT_EXPORT');
    await writeFile(path.join(root, 'app.ts'), 'export const answer = 42;');
    const output = JSON.stringify(await publicProjection(root, { stateHome: path.join(root, 'missing-state') }));
    assert.equal(JSON.parse(output).files.source, 1);
    assert.doesNotMatch(output, /\.env|FAKE_LOCAL_PRIVATE_TOKEN|DO_NOT_EXPORT|app\.ts|vxi-sensitive-fixture/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('filesystem traversal ignores symlink and hidden directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vxi-local-test-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'vxi-secret-test-'));
  try {
    await writeFile(path.join(outside, 'secret.ts'), 'secret');
    await symlink(outside, path.join(root, 'outside'));
    await mkdir(path.join(root, '.hidden'));
    await writeFile(path.join(root, '.hidden', 'secret.py'), 'secret');
    await writeFile(path.join(root, 'safe.ts'), 'safe');
    const inspected = await inspectWorkspace(root);
    assert.equal(inspected.counts.source, 1);
    assert.equal(inspected.skippedSymlinks, 1);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('check recording is local and exposes enums only', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'vxi-state-'));
  try {
    await recordCheck(fixture, 'test', 'PASS', { stateHome: home });
    const p = await publicProjection(fixture, { stateHome: home });
    assert.equal(p.checks.test, 'PASS');
    await assert.rejects(() => recordCheck(fixture, 'test', 'TOKEN=abc', { stateHome: home }), /INVALID_CHECK/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('MCP is read-only and rejects dangerous calls or extra parameters', async () => {
  assert.deepEqual(toolNames(), ['vxi_project_status', 'vxi_security_contract']);
  const list = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, fixture);
  assert.equal(list.result.tools.length, 2);
  const forbidden = await handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'exec', arguments: { command: 'rm -rf /' } } }, fixture);
  assert.equal(forbidden.error.code, -32602);
  const injected = await handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vxi_project_status', arguments: { path: '../../.env' } } }, fixture);
  assert.equal(injected.error.code, -32602);
  const safe = await handleRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'vxi_project_status', arguments: {} } }, fixture);
  assert.equal(safe.result.isError, false);
  assert.doesNotMatch(JSON.stringify(safe), /NEVER_A_REAL_CREDENTIAL/);
});

test('stdio server returns actual JSON-RPC messages without raw file data', async () => {
  const { spawn } = await import('node:child_process');
  const entry = fileURLToPath(new URL('../bin/vxi-local.mjs', import.meta.url));
  const processResult = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, 'mcp', '--workspace', fixture], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', x => { stdout += x.toString(); });
    child.stderr.on('data', x => { stderr += x.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'vxi_project_status', arguments: {} } }) + '\n');
    child.stdin.end();
  });
  assert.equal(processResult.code, 0);
  assert.equal(processResult.stderr, '');
  const parsed = JSON.parse(processResult.stdout.trim());
  assert.equal(parsed.id, 99);
  assert.ok(parsed.result?.content);
  assert.doesNotMatch(processResult.stdout, /NEVER_A_REAL_CREDENTIAL|FAKE_SECRET_FOR_TESTS|index\.js/);
});
