import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testMatch: "mobile.spec.ts",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: "http://127.0.0.1:5173",
    launchOptions: process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: JSON.parse(process.env.CHROMIUM_ARGS || "[]"),
        }
      : {},
    actionTimeout: 15000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_USE_EMULATORS: "true",
      VITE_FIREBASE_CONFIG: JSON.stringify({
        projectId: "demo-gridiron",
        apiKey: "demo-key",
        authDomain: "demo-gridiron.firebaseapp.com",
      }),
    },
  },
});
