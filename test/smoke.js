// Smoke test: start the bridge, send initialize + tools/list + a notification
// + an unauthenticated tool call, and check the replies. Needs network access
// to termal.in; no API key is required for what it checks.
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

const bin = path.join(__dirname, '..', 'bin', 'termalin-mcp.js');
const child = spawn(process.execPath, [bin], { env: { ...process.env, TERMALIN_API_KEY: '' }, stdio: ['pipe', 'pipe', 'pipe'] });

const replies = new Map();
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined) replies.set(msg.id, msg);
  }
});
child.stderr.on('data', (d) => process.stderr.write(d));

const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hosts_list', arguments: {} } });
child.stdin.end();

child.on('close', (code) => {
  const fail = (why) => { console.error('FAIL: ' + why); process.exit(1); };
  const init = replies.get(1);
  if (!init || !init.result || init.result.serverInfo?.name !== 'termalin') fail('initialize did not answer with serverInfo.name = termalin');
  const list = replies.get(2);
  if (!list || !Array.isArray(list.result?.tools) || list.result.tools.length < 10) fail('tools/list did not return a tool catalogue');
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['hosts_list', 'ssh_exec', 'sftp_read', 'data_query']) if (!names.includes(n)) fail(`tool ${n} missing from the catalogue`);
  const call = replies.get(3);
  if (!call || !call.error) fail('an unauthenticated tools/call should come back as a JSON-RPC error');
  if (code !== 0) fail(`bridge exited with code ${code}`);
  console.log(`ok: initialize, ${names.length} tools listed, unauthenticated call refused as "${call.error.message.slice(0, 60)}…"`);
});
