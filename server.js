import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchRedditMentions } from "./src/reddit.js";
import { parseKeywords } from "./src/matching.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/search") {
      const body = await readJsonBody(req);
      const keywords = parseKeywords(body.keywords);
      const timeRangeDays = Number(body.timeRangeDays || 14);

      if (!body.searchName || keywords.length === 0) {
        return sendJson(res, 400, {
          error: "Search name and at least one keyword are required.",
        });
      }

      if (body.region !== "singapore") {
        return sendJson(res, 400, {
          error: "This MVP currently supports Singapore only.",
        });
      }

      const results = await searchRedditMentions({ keywords, timeRangeDays });
      return sendJson(res, 200, {
        searchName: body.searchName,
        region: body.region,
        timeRangeDays,
        results,
      });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Something went wrong.",
    });
  }
});

server.listen(port, () => {
  console.log(`Mentions MVP is running at http://localhost:${port}`);
});

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir)) {
    return sendJson(res, 403, { error: "Forbidden." });
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}
