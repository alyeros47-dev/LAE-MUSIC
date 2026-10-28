"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const ROOT = "/var/lib/lae-review",
  MODE = "pr6-ephemeral-review-v1",
  SERVICE = "srv-dbfmk5ss728c73ded300";
const LINKS = Object.freeze({
  "lae-review-postgres": "postgres",
  "lae-review-password": "password",
  "lae-review-media": "media",
  "lae-review-provider-budget.json": "provider-budget.json",
});
function enabled(env = process.env) {
  return (
    env.NODE_ENV === "staging" &&
    env.LAE_REVIEW_ENVIRONMENT === MODE &&
    env.LAE_REVIEW_PERSISTENT_STORAGE === "1"
  );
}
function environment(env) {
  if (env.NODE_ENV !== "staging" || env.LAE_REVIEW_ENVIRONMENT !== MODE)
    throw Error("Review state refuses non-review environments");
  if (
    env.LAE_REVIEW_PERSISTENT_STORAGE &&
    !["0", "1"].includes(env.LAE_REVIEW_PERSISTENT_STORAGE)
  )
    throw Error("Invalid review storage mode");
  if (env.RENDER_SERVICE_ID && env.RENDER_SERVICE_ID !== SERVICE)
    throw Error("Review state refuses a different service");
  if (env.DATABASE_URL) {
    let u;
    try {
      u = new URL(env.DATABASE_URL);
    } catch {
      throw Error("Invalid isolated database configuration");
    }
    if (
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      u.hostname !== "127.0.0.1" ||
      u.port !== "55432" ||
      u.pathname !== "/lae_music_review"
    )
      throw Error("Review state refuses external database access");
  }
}
function stat(file) {
  try {
    return fs.lstatSync(file);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
function mounted(root, text) {
  return String(text)
    .split("\n")
    .some((line) => line.split(" ")[4] === root);
}
function checkMount(root, mountInfo) {
  const info = stat(root);
  if (
    !info?.isDirectory() ||
    info.isSymbolicLink() ||
    !mounted(root, mountInfo ?? fs.readFileSync("/proc/self/mountinfo", "utf8"))
  )
    throw Error(
      "Persistent review storage requires the dedicated mounted disk; refusing temporary fallback",
    );
}
function marker(root) {
  const file = path.join(root, ".lae-review-state.json"),
    s = stat(file);
  if (!s?.isFile() || s.isSymbolicLink())
    throw Error("Persistent review storage identity is missing");
  let m;
  try {
    m = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw Error("Persistent review storage identity is unreadable");
  }
  if (
    m.version !== 1 ||
    m.mode !== MODE ||
    m.service !== SERVICE ||
    !/^[a-f0-9]{32}$/.test(m.id || "")
  )
    throw Error("Persistent review storage identity mismatch");
  return m;
}
function verify({
  env = process.env,
  root = ROOT,
  legacyRoot = "/tmp",
  mountInfo,
} = {}) {
  environment(env);
  if (!enabled(env)) return { persistent: false };
  checkMount(root, mountInfo);
  marker(root);
  for (const [legacy, target] of Object.entries(LINKS)) {
    const p = path.join(legacyRoot, legacy),
      s = stat(p);
    if (!s?.isSymbolicLink() || fs.readlinkSync(p) !== path.join(root, target))
      throw Error("Persistent review state path mismatch");
    const state = stat(path.join(root, target));
    if (!state || state.isSymbolicLink())
      throw Error("Persistent review data is missing or linked elsewhere");
  }
  const version = path.join(root, "postgres", "PG_VERSION");
  if (stat(version) && fs.readFileSync(version, "utf8").trim() !== "16")
    throw Error(
      "Persistent review PostgreSQL version mismatch; data was not reset",
    );
  return { persistent: true };
}
function prepare({
  env = process.env,
  root = ROOT,
  legacyRoot = "/tmp",
  mountInfo,
  owner = { uid: process.getuid(), gid: process.getgid() },
} = {}) {
  environment(env);
  if (!enabled(env)) return { persistent: false };
  checkMount(root, mountInfo);
  for (const [legacy, target] of Object.entries(LINKS)) {
    const p = path.join(legacyRoot, legacy),
      s = stat(p);
    if (
      s &&
      (!s.isSymbolicLink() || fs.readlinkSync(p) !== path.join(root, target))
    )
      throw Error(
        "Existing local review data requires explicit migration; nothing was overwritten",
      );
  }
  const identity = path.join(root, ".lae-review-state.json");
  if (!stat(identity)) {
    if (fs.readdirSync(root).some((name) => name !== "lost+found"))
      throw Error(
        "Mounted disk is not empty and has no review identity; nothing was reset",
      );
    for (const name of ["postgres", "media", "backups"])
      fs.mkdirSync(path.join(root, name), { mode: 0o700 });
    fs.writeFileSync(
      path.join(root, "password"),
      crypto.randomBytes(32).toString("hex"),
      { mode: 0o600, flag: "wx" },
    );
    fs.writeFileSync(
      path.join(root, "provider-budget.json"),
      JSON.stringify({ openai: 0, musicapi: 0 }),
      { mode: 0o600, flag: "wx" },
    );
    fs.writeFileSync(
      identity,
      JSON.stringify({
        version: 1,
        mode: MODE,
        service: SERVICE,
        id: crypto.randomBytes(16).toString("hex"),
      }),
      { mode: 0o600, flag: "wx" },
    );
  }
  marker(root);
  for (const name of [
    "postgres",
    "media",
    "backups",
    "password",
    "provider-budget.json",
    ".lae-review-state.json",
  ]) {
    const p = path.join(root, name),
      s = stat(p);
    if (!s || s.isSymbolicLink())
      throw Error(
        "Persistent review state is incomplete; refusing to initialize replacement data",
      );
    if (
      ["postgres", "media", "backups"].includes(name)
        ? !s.isDirectory()
        : !s.isFile()
    )
      throw Error("Invalid persistent review state type");
    fs.chownSync(p, owner.uid, owner.gid);
    fs.chmodSync(p, s.isDirectory() ? 0o700 : 0o600);
  }
  fs.chownSync(root, owner.uid, owner.gid);
  fs.chmodSync(root, 0o700);
  for (const [legacy, target] of Object.entries(LINKS)) {
    const p = path.join(legacyRoot, legacy);
    if (!stat(p)) fs.symlinkSync(path.join(root, target), p);
  }
  return verify({ env, root, legacyRoot, mountInfo });
}
if (require.main === module) {
  try {
    if (process.argv[2] === "prepare") {
      if (process.getuid() !== 0)
        throw Error("Review disk setup requires the container entrypoint");
      const cp = require("node:child_process");
      const owner = {
        uid: Number(
          cp
            .execFileSync("id", ["-u", "postgres"], { encoding: "utf8" })
            .trim(),
        ),
        gid: Number(
          cp
            .execFileSync("id", ["-g", "postgres"], { encoding: "utf8" })
            .trim(),
        ),
      };
      const result = prepare({ owner });
      if (result.persistent) {
        const page = "/app/web/index.html";
        fs.writeFileSync(page, notice(fs.readFileSync(page, "utf8"), true));
      }
    } else if (process.argv[2] === "verify") verify();
    else throw Error("Invalid review state operation");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 64;
  }
}
function persistentService(s) {
  const d = s?.serviceDetails?.disk;
  return (
    s?.id === SERVICE &&
    s?.serviceDetails?.plan === "starter" &&
    /^dsk-[a-z0-9]+$/.test(d?.id || "") &&
    d.name === "lae-music-review-state" &&
    d.mountPath === ROOT &&
    d.sizeGB === 1
  );
}
function notice(html, persistent) {
  if (!persistent) return html;
  const text =
    '<p class="notice" role="note" id="review-notice"><strong>REVIEW SANDBOX.</strong> Dedicated persistent storage is configured for test accounts and uploaded test files across deployments. This is separate from production. Provider test limits still apply. Real payments, live R2 write tests and new voice training remain disabled.</p>';
  if (/<p[^>]*id="review-notice"[^>]*>/.test(html))
    return html.replace(/<p[^>]*id="review-notice"[^>]*>[\s\S]*?<\/p>/, text);
  if (!html.includes('<main id="page"'))
    throw Error("Review page notice anchor missing");
  return html.replace('<main id="page"', text + '<main id="page"');
}
module.exports = {
  ROOT,
  LINKS,
  enabled,
  mounted,
  prepare,
  verify,
  persistentService,
  notice,
};
