import { createHash, randomBytes } from 'node:crypto';
import { readdir, realpath, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EXCLUDED_DIRS = new Set([
  '.git', '.vxi-local', '.svn', '.hg', 'node_modules', 'vendor', 'dist',
  'build', 'coverage', '.next', '.astro', '.venv', 'venv', '__pycache__'
]);
const CHECK_KEYS = ['lint', 'test', 'build'];
const STATES = new Set(['PASS', 'FAIL', 'UNKNOWN']);
const DEFAULT_COUNTS = () => ({ source: 0, test: 0, docs: 0, other: 0 });

function fileClass(name) {
  const lowered = name.toLowerCase();
  if (/\b(test|spec)\b|\.test\.|\.spec\./.test(lowered)) return 'test';
  if (/\.(js|cjs|mjs|ts|tsx|jsx|py|rs|go|java|c|cc|cpp|h|hpp|rb|swift|kt|sh)$/.test(lowered)) return 'source';
  if (/\.(md|mdx|rst|txt)$/.test(lowered)) return 'docs';
  return 'other';
}

export async function inspectWorkspace(workspace, { maxEntries = 20000 } = {}) {
  const root = await realpath(workspace);
  if (!(await lstat(root)).isDirectory()) throw new Error('WORKSPACE_NOT_DIRECTORY');
  const counts = DEFAULT_COUNTS();
  const stack = [root];
  let visited = 0;
  let skippedSymlinks = 0;
  while (stack.length > 0) {
    const dir = stack.pop();
    // Recheck each directory against the authorized canonical root. This limits
    // accidental traversal if a directory was replaced after it was queued.
    const resolved = await realpath(dir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      skippedSymlinks++;
      continue;
    }
    if ((await lstat(dir)).isSymbolicLink()) {
      skippedSymlinks++;
      continue;
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++visited > maxEntries) throw new Error('WORKSPACE_TOO_LARGE');
      // Never follow a symlink, including a symlink pointing inside the workspace.
      if (entry.isSymbolicLink()) { skippedSymlinks++; continue; }
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          stack.push(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        counts[fileClass(entry.name)]++;
      }
      // No file contents or paths are read or exported.
    }
  }
  return { root, counts, skippedSymlinks, visited };
}

export function privateStatePath(canonicalRoot, stateHome = path.join(os.homedir(), '.vxi-local-first')) {
  const digest = createHash('sha256').update(canonicalRoot).digest('hex');
  return { directory: stateHome, file: path.join(stateHome, `${digest}.json`) };
}

function strictChecks(candidate) {
  const result = { lint: 'UNKNOWN', test: 'UNKNOWN', build: 'UNKNOWN' };
  if (candidate && typeof candidate === 'object') {
    for (const key of CHECK_KEYS) {
      if (STATES.has(candidate[key])) result[key] = candidate[key];
    }
  }
  return result;
}

async function readChecks(root, stateHome) {
  const { file } = privateStatePath(root, stateHome);
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 4096) return strictChecks(null);
    const state = JSON.parse(await readFile(file, 'utf8'));
    return strictChecks(state.checks);
  } catch { return strictChecks(null); }
}

export async function recordCheck(workspace, kind, status, { stateHome } = {}) {
  if (!CHECK_KEYS.includes(kind) || !STATES.has(status)) throw new Error('INVALID_CHECK');
  const root = await realpath(workspace);
  if (!(await lstat(root)).isDirectory()) throw new Error('WORKSPACE_NOT_DIRECTORY');
  const { directory, file } = privateStatePath(root, stateHome);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('STATE_DIR_UNSAFE');
  const checks = await readChecks(root, stateHome);
  checks[kind] = status;
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ checks }), { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } catch (err) {
    // No path or raw error data is returned to the cloud.
    throw new Error(err?.code === 'EACCES' ? 'STATE_PERMISSION_DENIED' : 'STATE_WRITE_FAILED');
  }
  return checks;
}

export async function publicProjection(workspace, options = {}) {
  const inspected = await inspectWorkspace(workspace);
  const checks = await readChecks(inspected.root, options.stateHome);
  // Hard-coded allowlist of output fields. Never spread values from local files.
  return {
    contract: 'VXI_LOCAL_STRICT_V1',
    code_exported: false,
    files: inspected.counts,
    symlinks_skipped: inspected.skippedSymlinks,
    checks,
    review_scope: 'METADATA_ONLY',
    execution_authority: 'NONE',
    status: 'LOCAL_ONLY'
  };
}

export const SECURITY_CONTRACT = Object.freeze({
  trust_mode: 'STRICT_LOCAL_FIRST',
  exposed: ['file_counts_by_class', 'check_enums', 'symlink_count'],
  forbidden: ['source', 'file_paths', 'diffs', 'logs', 'secrets', 'shell', 'git_write'],
  limitation: 'Cloud reviewers cannot perform code-level review without source.'
});
