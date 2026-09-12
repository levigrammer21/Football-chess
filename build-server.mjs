import { build } from "esbuild";
import { copyFile, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  outfile: "server.cjs",
});
for (const name of [
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
])
  await copyFile(name, `dist/${name}`);
const assets = (await readdir("dist/assets")).map((x) => `/assets/${x}`);
let worker = await readFile("sw.js", "utf8");
const hash = createHash("sha256")
  .update(assets.join())
  .digest("hex")
  .slice(0, 12);
worker = worker
  .replace("const CACHE='gridiron-1.0.0'", `const CACHE='gridiron-${hash}'`)
  .replace(
    "const PRECACHE=",
    `const PRECACHE=${JSON.stringify(assets)}.concat`,
  );
// Keep precache assets and the static shell in one generated array.
worker = worker
  .replace(".concat[", ".concat([")
  .replace("'/icon-512.png'];", "'/icon-512.png']);");
await writeFile("dist/sw.js", worker);
