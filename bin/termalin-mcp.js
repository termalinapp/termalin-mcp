#!/usr/bin/env node
// termalin-mcp: a stdio MCP server that forwards to Termalin's hosted MCP
// endpoint. Every JSON-RPC message read from stdin is POSTed to the endpoint
// with your API key; every reply (plain JSON or an event stream for long
// commands) is written back to stdout. Nothing is interpreted in between.
//
//   TERMALIN_API_KEY       tk_live_… from https://termal.in/account (API keys & MCP)
//   TERMALIN_API_KEY_FILE  path of a file holding the key (one line)
//   TERMALIN_MCP_URL       endpoint override (default https://termal.in/api/v1/mcp)
//
// Logs go to stderr only; stdout carries JSON-RPC and nothing else.

'use strict';

const fs = require('node:fs');
const readline = require('node:readline');

const VERSION = require('../package.json').version;
const DEFAULT_URL = 'https://termal.in/api/v1/mcp';
const PROTOCOL = '2025-06-18';

function usage() {
  process.stderr.write(`termalin-mcp ${VERSION}
Bridge between an MCP client that speaks stdio and Termalin's hosted MCP server.

Usage: termalin-mcp [--help] [--version]

Environment:
  TERMALIN_API_KEY        API key (tk_live_…) from https://termal.in/account
  TERMALIN_API_KEY_FILE   file that holds the key instead of the variable
  TERMALIN_MCP_URL        endpoint (default ${DEFAULT_URL})

Without a key the server still answers initialize and tools/list, so a client
can show the tool catalogue; tool calls then come back with a sign-in error.
`);
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { usage(); process.exit(0); }
if (argv.includes('--version') || argv.includes('-v')) { process.stdout.write(VERSION + '\n'); process.exit(0); }
if (argv.length) { process.stderr.write(`termalin-mcp: unknown argument ${argv[0]} (the key goes in TERMALIN_API_KEY, not on the command line)\n`); process.exit(2); }

const url = (process.env.TERMALIN_MCP_URL || DEFAULT_URL).trim();
let key = (process.env.TERMALIN_API_KEY || '').trim();
if (!key && process.env.TERMALIN_API_KEY_FILE) {
  try { key = fs.readFileSync(process.env.TERMALIN_API_KEY_FILE, 'utf8').trim(); }
  catch (e) { process.stderr.write(`termalin-mcp: cannot read TERMALIN_API_KEY_FILE: ${e.message}\n`); process.exit(2); }
}
if (!key) process.stderr.write('termalin-mcp: no TERMALIN_API_KEY set; tool calls will ask you to sign in\n');

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
  'MCP-Protocol-Version': PROTOCOL,
  'User-Agent': `termalin-mcp/${VERSION} node/${process.versions.node}`,
};
if (key) headers['Authorization'] = `Bearer ${key}`;

let pending = 0;
let stdinClosed = false;
const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const maybeExit = () => { if (stdinClosed && pending === 0) process.exit(0); };

function errorReply(id, code, message) {
  if (id === undefined || id === null) return;
  out({ jsonrpc: '2.0', id, error: { code, message } });
}

// Read an event stream and emit every JSON-RPC message in it. The server
// sends a comment line every 15 s while a long command runs, then the
// response; a client that passed a progressToken gets progress notifications.
async function pumpEventStream(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let data = [];
  const flush = () => {
    if (!data.length) return;
    const text = data.join('\n');
    data = [];
    try { out(JSON.parse(text)); }
    catch { process.stderr.write(`termalin-mcp: skipped a non-JSON event: ${text.slice(0, 120)}\n`); }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') { flush(); continue; }
      if (line.startsWith(':')) continue;               // keep-alive comment
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      // event:, id:, retry: carry nothing we need
    }
  }
  if (buf.trim()) data.push(buf.trim());
  flush();
}

async function forward(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { return errorReply(null, -32700, 'parse error'); }
  const id = msg && typeof msg === 'object' && !Array.isArray(msg) ? msg.id : undefined;
  pending++;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: line });
    if (res.status === 202 || res.status === 204) return;          // notification, no reply
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok && !ctype.includes('json') && !ctype.includes('event-stream')) {
      const text = (await res.text()).trim();
      const hint = res.status === 401 || res.status === 403
        ? ' Create an API key at https://termal.in/account (API keys & MCP) and set TERMALIN_API_KEY.'
        : '';
      return errorReply(id, -32000, `termal.in answered HTTP ${res.status}${text ? ': ' + text.slice(0, 300) : ''}.${hint}`);
    }
    if (ctype.includes('text/event-stream')) return await pumpEventStream(res);
    const text = await res.text();
    if (!text.trim()) return;
    try { out(JSON.parse(text)); }
    catch { errorReply(id, -32000, `termal.in sent a reply that is not JSON (HTTP ${res.status})`); }
  } catch (e) {
    errorReply(id, -32000, `cannot reach ${url}: ${e.message}`);
  } finally {
    pending--;
    maybeExit();
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
rl.on('line', (line) => { if (line.trim()) forward(line); });
rl.on('close', () => { stdinClosed = true; maybeExit(); });
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });
