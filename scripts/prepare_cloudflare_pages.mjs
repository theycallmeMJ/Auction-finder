import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist-pages");
const server = resolve(root, "dist", "server");
const client = resolve(root, "dist", "client");
const cloudflare = resolve(root, "cloudflare");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Cloudflare Pages advanced mode serves static files from the output directory
// and runs `_worker.js` for dynamic/SSR requests. Vinext already builds a
// Cloudflare-compatible worker in `dist/server/index.js`.
await cp(server, output, { recursive: true });
await cp(client, output, { recursive: true });
await cp(cloudflare, join(output, "cloudflare"), { recursive: true });

await writeFile(
  join(output, "_worker.js"),
  `import app from "./index.js";
import { handleMarketAnalysisRequest } from "./cloudflare/market-analysis-api.mjs";

const staticPrefixes = ["/assets/", "/data/"];
const staticFiles = new Set([
  "/favicon.svg",
  "/file.svg",
  "/globe.svg",
  "/window.svg",
]);

function withCacheControl(response, value) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/properties/")) {
      const apiResponse = await handleMarketAnalysisRequest(request, env);
      if (apiResponse) return apiResponse;
    }
    if (staticPrefixes.some((prefix) => url.pathname.startsWith(prefix)) || staticFiles.has(url.pathname)) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        if (url.pathname.startsWith("/data/")) {
          return withCacheControl(response, "no-cache, must-revalidate");
        }
        return response;
      }
    }
    const response = await app.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return withCacheControl(response, "no-store");
    }
    return response;
  },
};
`,
);

console.log(`Prepared Cloudflare Pages output at ${output}`);
