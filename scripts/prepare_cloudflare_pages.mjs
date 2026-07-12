import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist-pages");
const server = resolve(root, "dist", "server");
const client = resolve(root, "dist", "client");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Cloudflare Pages advanced mode serves static files from the output directory
// and runs `_worker.js` for dynamic/SSR requests. Vinext already builds a
// Cloudflare-compatible worker in `dist/server/index.js`.
await cp(server, output, { recursive: true });
await cp(join(server, "index.js"), join(output, "_worker.js"));
await cp(client, output, { recursive: true });

console.log(`Prepared Cloudflare Pages output at ${output}`);
