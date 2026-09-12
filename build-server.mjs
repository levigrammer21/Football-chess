import { build } from "esbuild";
import { copyFile, readFile, writeFile, readdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
await build({ entryPoints: ["server.ts"], bundle: true, platform: "node", target: "node22", format: "cjs", packages: "external", outfile: "server.cjs" });
await rename("dist/app.html", "dist/index.html");
for (const name of ["manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"])
  await copyFile(name, `dist/${name}`);
const files = (await readdir("dist")).sort();
const hash = createHash("sha256");
for (const name of files) hash.update(await readFile(`dist/${name}`));
const worker = (await readFile("service-worker.js", "utf8"))
  .replace("__VERSION__", hash.digest("hex").slice(0, 12))
  .replace("__PRECACHE__", JSON.stringify(files.map(name => `./${name}`)));
await writeFile("dist/sw.js", worker);
// Keep browser-ready files at the repository root for phone uploads.
for (const name of [...files, "sw.js"]) await copyFile(`dist/${name}`, name);
