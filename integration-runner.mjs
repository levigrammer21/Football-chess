// Runs the unchanged exported HTTPS callable on TCP for environments without Unix sockets.
// Firebase Auth and Firestore emulators must already be running. Never use this with production.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
if (
  process.env.GCLOUD_PROJECT !== "demo-gridiron" ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error(
    "This test runner requires demo-gridiron and both emulators.",
  );
process.env.FUNCTIONS_EMULATOR = "true";
const require = createRequire(import.meta.url);
const express = require("express");
const { coach } = require("./server.cjs");
const app = express();
app.use(express.json({ limit: "1mb" }));
app.post("/demo-gridiron/us-central1/coach", coach);
app.options("/demo-gridiron/us-central1/coach", coach);
const server = app.listen(5001, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
async function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });
    p.on("exit", (code) => resolve(code ?? 1));
  });
}
let code = 0;
try {
  if (!process.argv.includes("--browser-only"))
    code = await run([
      "--import",
      "tsx",
      "--test",
      "rules.test.ts",
      "integration.test.ts",
    ]);
  if (!code) code = await run(["node_modules/@playwright/test/cli.js", "test"]);
} finally {
  server.close();
}
process.exit(code);
