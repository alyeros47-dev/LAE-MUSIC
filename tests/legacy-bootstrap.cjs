"use strict";
// Run the preserved server initialization against an owned fixture database,
// without new migrations, background workers, a network listener or providers.
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const { createRequire } = require("node:module");
async function bootstrap(pool) {
  const root = path.join(__dirname, ".."),
    load = createRequire(path.join(root, "server.js"));
  let ready, failed;
  const initialized = new Promise((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const sandbox = {
    require(name) {
      if (name === "pg")
        return {
          Pool: class {
            constructor() {
              return pool;
            }
          },
        };
      if (name === "./lib/migrations") return { migrate: async () => [] };
      if (name === "./lib/platform")
        return { createPlatform: () => ({ start() {} }) };
      if (name === "web-push")
        return {
          generateVAPIDKeys: () => ({
            publicKey: "fixture-public",
            privateKey: "fixture-private",
          }),
          setVapidDetails() {},
        };
      if (name === "node:http")
        return {
          createServer() {
            return {
              listen() {
                ready();
              },
            };
          },
        };
      return load(name);
    },
    process: {
      env: { DATABASE_URL: "postgres://127.0.0.1/fixture", NODE_ENV: "test" },
      exit(code) {
        failed(Error("Legacy initialization failed: " + code));
      },
    },
    __dirname: root,
    console: {
      log() {},
      warn() {},
      error: (...args) => failed(Error(args.map(String).join(" "))),
    },
    Buffer,
    URL,
    URLSearchParams,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => {
      throw Error(
        "External service calls are forbidden during upgrade rehearsal",
      );
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "server.js"), "utf8"),
    sandbox,
    { filename: "server.js" },
  );
  await initialized;
}
module.exports = { bootstrap };
