# VXI Local-First MCP

A **source-free, read-only MCP status bridge** for sensitive development workspaces. Node.js 22+, zero npm dependencies. Original demonstration implementation; no code or configuration was copied from any commercial project.

**Security claim (narrow):** the MCP tools in this repository export only pre-defined numeric file counts, enums, and static policy. They do **not** expose source, file paths, Git diffs, logs, environment variables, or command execution. This is a projection boundary, **not** a claim that an unrelated AI coding client keeps code private. A local desktop application connected to a hosted model may still transmit source. For a strictly no-source-outbound workflow, use local inference or deterministic human-approved local operations for the coding step.

## Try in under a minute

```bash
node --version  # >= 22
npm test
npm run demo
```

The demo scans an intentionally synthetic directory containing a fake secret-like text fixture. Its file name and contents never appear in MCP responses. The test suite additionally creates local `.env` files in temporary workspaces; these files are not included in the public repository.

## Inspect your own local project without sharing source

```bash
node bin/vxi-local.mjs status --workspace /path/to/local/workspace
node bin/vxi-local.mjs record --workspace /path/to/local/workspace --kind test --status PASS
node bin/vxi-local.mjs status --workspace /path/to/local/workspace
```

`record` is a **local CLI action**, not an MCP tool. It stores only status enums under `~/.vxi-local-first/` (not in the repo). Statuses are human-recorded assertions; they are **not** verified attestations of test execution. A safer future extension can bind them to a local CI signature.

## Run an MCP stdio server

```bash
VXI_WORKSPACE=/path/to/local/workspace node bin/vxi-local.mjs mcp
```

Tools: `vxi_project_status`, `vxi_security_contract`. Neither accepts arguments; all other method/tool names are rejected. The server uses line-delimited JSON-RPC on stdio and is intended to run in a trusted local process.

### Connect from ChatGPT without a public inbound port (optional)

Use the officially documented **OpenAI Secure MCP Tunnel** and your own Platform tunnel permissions. The tunnel client can launch a local stdio MCP server. Configure its `--mcp-command` to point to the `mcp` CLI above, with `VXI_WORKSPACE` supplied only on the local machine. Follow the actual current `tunnel-client help quickstart` and onboarding instructions:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

This package has been tested offline only; no ChatGPT/Platform tunnel connection is claimed. Tunnel connectivity alone cannot prevent data leakage if a different MCP tool exports source. The safe surface here is enforced by this server's output schema.

## Workflow boundary

1. Cloud model sees only abstract task instructions and the fixed output of this bridge. **Never paste business code or raw logs** into cloud chat.
2. Developer writes an abstract plan with no confidential file names or snippets.
3. A local human/local-only model determines file-level edits. A cloud-backed desktop coding agent is **not** a strictly local model.
4. Run real tests locally. Record only PASS/FAIL/UNKNOWN via the local CLI; optionally inspect full diff locally.
5. Cloud model may review *evidence sufficiency*, not unseen code correctness. No `DONE` claim without local review.

## Threat model

- Reject source export by construction: no read-file or diff tools.
- Paths remain internal; only explicit numeric counters are returned.
- Static symlinks are skipped; each queued directory is rechecked against the canonical root. Like any pathname-based traversal, it is not a proof against a hostile concurrent symlink replacement on a shared filesystem. Dot-directories and common build/cache directories are skipped.
- Check state is stored outside the project. File contents are never opened during scanning.
- A local attacker who controls the Node process, runtime environment, or MCP host is **out of scope**.
- Metadata can also be sensitive. Do not use without approval where file counts/test statuses are classified.
- MCP callers remain untrusted. Do not extend the tool list with `exec`, file reads or remote shell without a new threat-model review.

## Limitations

- No actual code review by the cloud model; strict privacy trades away code-level cloud reasoning.
- No local LLM or Codex desktop automation bundled; install/configure those independently.
- `record` assertions are not cryptographically bound to an executed commit.
- No remote connection, cost reduction, or production safety was verified by this offline fixture.
- The scanner is bounded by 20,000 directory entries and does not follow symlinks.

License: MIT.