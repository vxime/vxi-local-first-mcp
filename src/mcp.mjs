import readline from 'node:readline';
import { publicProjection, SECURITY_CONTRACT } from './project.mjs';

const TOOLS = [
  {
    name: 'vxi_project_status',
    title: 'Read anonymized project status',
    description: 'Only counts and fixed status enums; never returns files, paths, diffs, logs, or commands.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'vxi_security_contract',
    title: 'Read local privacy contract',
    description: 'Static description of the privacy boundary, without project data.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

export function toolNames() { return TOOLS.map(({ name }) => name); }

export async function handleRequest(message, workspace, options = {}) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  }
  const { id, method, params } = message;
  if (id === undefined) return null; // MCP notification.
  const success = (result) => ({ jsonrpc: '2.0', id, result });
  const error = (code, msg) => ({ jsonrpc: '2.0', id, error: { code, message: msg } });
  if (method === 'initialize') {
    return success({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'vxi-local-first-mcp', version: '0.1.0' }
    });
  }
  if (method === 'ping') return success({});
  if (method === 'tools/list') return success({ tools: TOOLS });
  if (method !== 'tools/call') return error(-32601, 'Method not found');
  if (!params || !toolNames().includes(params.name)) return error(-32602, 'Unknown or forbidden tool');
  if (params.arguments && (typeof params.arguments !== 'object' || Array.isArray(params.arguments) || Object.keys(params.arguments).length)) {
    return error(-32602, 'Tool arguments must be empty');
  }
  try {
    const value = params.name === 'vxi_project_status'
      ? await publicProjection(workspace, options)
      : SECURITY_CONTRACT;
    return success({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: false });
  } catch {
    return error(-32000, 'LOCAL_STATUS_UNAVAILABLE');
  }
}

export async function runStdioMcp(workspace, options = {}) {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    let request;
    try {
      if (line.length > 8192) throw new Error('too long');
      request = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      continue;
    }
    const response = await handleRequest(request, workspace, options);
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  }
}
