"use strict";
// Browser downloads need actual network responses: interception of attachment
// navigations is not consistent across WebKit builds. Data remains isolated.
const http = require("node:http");
async function createBrowserExportServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
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
