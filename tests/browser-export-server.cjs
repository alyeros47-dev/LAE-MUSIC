"use strict";
// Browser downloads need actual network responses: interception of attachment
// navigations is not consistent across WebKit builds. Data remains isolated.
const http = require("node:http");
async function createBrowserExportServer() {
  let voiceUpload = null;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    // WebKit does not expose Blob request bodies through route.postDataBuffer.
    // Receive the real browser upload over local HTTP instead of skipping it.
    if (
      url.pathname === "/api/voice/sample" &&
      req.method === "PUT" &&
      voiceUpload
    ) {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 12000000) throw Error("Oversized fixture upload");
          chunks.push(chunk);
        }
        const result = await voiceUpload(Buffer.concat(chunks));
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.body));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Voice fixture validation failed: " + error.message,
          }),
        );
      }
      return;
    }
    let filename, csv;
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (
      url.pathname === "/api/platform/artist-analytics" &&
      url.searchParams.get("format") === "csv"
    ) {
      filename = "lae-music-analytics.csv";
      csv = "Song,Plays\r\nTest release 02,42\r\n";
    } else if (
      url.pathname === "/api/platform/admin/reconciliation/ledger.csv" &&
      ["USD", "NGN"].includes(url.searchParams.get("currency"))
    ) {
      const currency = url.searchParams.get("currency");
      filename = "lae-ledger-" + currency + ".csv";
      csv = '"currency","amount_minor"\r\n"' + currency + '","1234"\r\n';
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + filename + '"',
      "Content-Length": Buffer.byteLength(csv),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(csv);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    setVoiceUpload: (handler) => {
      voiceUpload = handler;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
async function downloadText(download) {
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
module.exports = { createBrowserExportServer, downloadText };
