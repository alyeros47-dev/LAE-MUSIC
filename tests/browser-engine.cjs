"use strict";
// One selector for both full website journeys and real PWA storage/playback tests.
const engines = ["chromium", "firefox", "webkit"];
const engine = process.env.LAE_TEST_BROWSER || "chromium";
if (!engines.includes(engine))
  throw Error("Unsupported LAE_TEST_BROWSER: " + engine);
const playwright = require(process.env.LAE_PLAYWRIGHT_MODULE || "playwright");
async function launchBrowser() {
  const browser = await playwright[engine].launch({
    headless: true,
    ...(engine === "chromium"
      ? {
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
          ...(process.env.LAE_CHROMIUM_PATH
            ? { executablePath: process.env.LAE_CHROMIUM_PATH }
            : {}),
        }
      : {}),
  });
  console.log("Testing browser engine " + engine + " " + browser.version());
  return browser;
}
const artifactLabel = (label) =>
  engine === "chromium" ? label : engine + "-" + label;
module.exports = { engine, engines, launchBrowser, artifactLabel };
