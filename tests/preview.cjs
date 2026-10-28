'use strict';
// Test-only boot adapter. No packages are stubbed in production, and no fake data is served.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');
const actualRequire = createRequire(path.join(root, 'server.js'));
function boot(port = 3100) {
  let server;
  const sandbox = {
    require(name) {
      if (name === 'pg') return { Pool: class { constructor() { throw Error('Preview has no database; use a real pg installation for database tests.'); } } };
      if (name === 'web-push') return {}; // No database => push initialization is never called.
      if (name === 'node:http') return { ...require('node:http'), createServer(handler) { server = require('node:http').createServer(handler); const listen=server.listen.bind(server); server.listen=(port,_host,callback)=>listen(port,'127.0.0.1',callback); return server; } };
      return actualRequire(name);
    },
    process: { env: { PORT: String(port), NODE_ENV: 'test' }, exit(code) { throw Error('Server startup failed: ' + code); } },
    __dirname: root, console, Buffer, URL, URLSearchParams, fetch, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), sandbox, { filename: 'server.js' });
  return new Promise((resolve, reject) => { server.once('listening', () => resolve(server)); server.once('error', reject); });
}
module.exports = { boot };
if (require.main === module) boot(Number(process.argv[2] || 3100));
