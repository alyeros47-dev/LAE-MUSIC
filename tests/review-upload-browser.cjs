"use strict";
// Real loopback review server + PostgreSQL + temporary files. No provider calls.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  crypto = require("node:crypto");
const { launchBrowser } = require("./browser-engine.cjs");
(async () => {
  if (process.env.LAE_REVIEW_FRESH_BROWSER !== "1")
    throw Error("Opt in only for the owned local review container");
  const origin = "http://127.0.0.1:3116",
    browser = await launchBrowser();
  try {
    for (const [name, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
          viewport,
          reducedMotion: "reduce",
        }),
        page = await context.newPage();
      await page.goto(origin + "/join?role=artist&mode=register");
      await page
        .getByLabel("Display name", { exact: true })
        .fill("Fresh " + name + " artist");
      await page
        .getByLabel("Email address", { exact: true })
        .fill("fresh-" + crypto.randomUUID() + "@ci.invalid");
      await page.getByLabel("Country", { exact: true }).fill("Nigeria");
      await page
        .getByLabel("Password", { exact: true })
        .fill("FreshReviewPassword123");
      await page
        .getByLabel("Confirm password", { exact: true })
        .fill("FreshReviewPassword123");
      await page
        .getByRole("button", { name: "Create free account ↗", exact: true })
        .click();
      await page.waitForURL("**/workspace");
      await page.goto(origin + "/workspace?tab=upload");
      await page
        .getByRole("button", { name: "Upload & publish", exact: true })
        .waitFor();
      assert(
        !(await page
          .getByRole("button", { name: "Upload & publish", exact: true })
          .isDisabled()),
      );
      const title = "Original " + name + " test tone";
      await page.getByLabel("Song title", { exact: true }).fill(title);
      await page.getByLabel("Genre", { exact: true }).fill("Highlife");
      await page.locator("input[name=audio]").setInputFiles({
        name: "original-test-tone.mp3",
        mimeType: name === "mobile" ? "" : "audio/mpeg",
        buffer: Buffer.from(
          fs
            .readFileSync("tests/fixtures/review-tone.mp3.base64", "utf8")
            .trim(),
          "base64",
        ),
      });
      await page
        .locator("input[name=cover]")
        .setInputFiles({
          name: "original-test-art.png",
          mimeType: name === "mobile" ? "" : "image/png",
          buffer: Buffer.from(
            fs
              .readFileSync("tests/fixtures/review-art.png.base64", "utf8")
              .trim(),
            "base64",
          ),
        });
      await page
        .getByRole("checkbox", {
          name: /I own or have permission to distribute/,
        })
        .check();
      await page
        .getByRole("button", { name: "Upload & publish", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Your music catalog", exact: true })
        .waitFor();
      await page.getByText(title, { exact: true }).waitFor();
      await page
        .getByRole("link", { name: "View public profile ↗", exact: true })
        .click();
      await page
        .getByAltText("Artwork for " + title, { exact: true })
        .waitFor();
      await page.waitForFunction((title) => {
        const img = Array.from(document.images).find(
          (x) => x.alt === "Artwork for " + title,
        );
        return img?.naturalWidth === 64;
      }, title);
      await page
        .getByRole("button", { name: "Play " + title, exact: true })
        .click();
      await page.waitForFunction(() => {
        const a = document.getElementById("audio");
        return a && a.readyState >= 2 && a.currentTime > 0;
      });
      assert(await page.locator("#audio").evaluate((a) => a.duration > 1));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.goto(origin + "/studio");
      await page
        .getByText(/Sandbox test access is active without payment/)
        .waitFor();
      await context.close();
      console.log(
        "PASS real " +
          name +
          " signup → free upload → verified publish → artist page → MP3 decoding/playback → studio trial notice; no provider or R2 calls.",
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
