"use strict";
// Writes a new server secret only to the explicitly selected file; never prints it.
const crypto = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output") {
  console.error(
    "Usage: node scripts/create-offline-key.cjs --output /secure/path/offline-key.txt",
  );
  process.exitCode = 1;
} else {
  const output = path.resolve(args[1]),
    { privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }),
    encoded = Buffer.from(
      privateKey.export({ format: "pem", type: "pkcs8" }),
    ).toString("base64");
  try {
    fs.writeFileSync(output, encoded + "\n", { mode: 0o600, flag: "wx" });
    console.log(
      "New offline signing key written to " +
        output +
        ". Set its content as OFFLINE_LICENSE_PRIVATE_KEY through the hosting secret manager. Do not commit or share it.",
    );
  } catch {
    console.error(
      "Could not create the key file. Choose an existing secure directory and a new filename.",
    );
    process.exitCode = 1;
  }
}
