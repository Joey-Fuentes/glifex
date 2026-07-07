// Playwright config for the Glifex playground E2E suite.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // "list" prints a labeled line per test (pass OR fail); CI otherwise defaults
  // to "dot", which collapses to dots + a count and hides individual titles.
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    // Wasm-heavy pages in Docker CI hit /dev/shm limits — disable shm usage.
    launchOptions: { args: ["--disable-dev-shm-usage"] },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // WebKit-on-Linux ≠ real Safari, and its wasm feature support (SIMD,
    // threads, GC) lags — enable once wasm runtimes land, with feature checks.
  ],
  webServer: {
    command: "python3 -m http.server -d ../web 8080",   // webServer cwd = config dir (e2e/), so web/ is one level up
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
  },
});
