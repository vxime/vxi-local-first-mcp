#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicProjection, recordCheck, SECURITY_CONTRACT } from '../src/project.mjs';
import { runStdioMcp } from '../src/mcp.mjs';

function flagValue(args, key) {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
}

const argv = process.argv.slice(2);
const action = argv[0] ?? 'help';
const fixture = fileURLToPath(new URL('../fixtures/synthetic-project', import.meta.url));
const workspace = flagValue(argv, '--workspace') || process.env.VXI_WORKSPACE || fixture;

try {
  switch (action) {
    case 'demo':
    case 'status':
      process.stdout.write(JSON.stringify(await publicProjection(workspace), null, 2) + '\n');
      break;
    case 'record': {
      const kind = flagValue(argv, '--kind');
      const status = flagValue(argv, '--status');
      await recordCheck(workspace, kind, status);
      process.stdout.write('Local check recorded; no project data transmitted.\n');
      break;
    }
    case 'contract':
      process.stdout.write(JSON.stringify(SECURITY_CONTRACT, null, 2) + '\n');
      break;
    case 'mcp':
      await runStdioMcp(workspace);
      break;
    default:
      process.stdout.write('Usage: vxi-local demo | status [--workspace PATH] | record --kind test|lint|build --status PASS|FAIL|UNKNOWN [--workspace PATH] | contract | mcp [--workspace PATH]\n');
  }
} catch {
  // Do not echo workspace paths, local errors, or file content to stdout/stderr.
  process.stderr.write('Local operation failed. Verify the workspace and permissions.\n');
  process.exitCode = 1;
}
