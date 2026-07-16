// Standalone: this spike never touches the repo's e2e/ config.
module.exports = {
  testDir: __dirname,
  testMatch: /demo\.spec\.js/,
  timeout: 300_000,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8099", trace: "retain-on-failure" },
  webServer: {
    command: "python3 -m http.server 8099 --bind 127.0.0.1",
    cwd: __dirname,
    url: "http://127.0.0.1:8099/index.html",
    reuseExistingServer: false,
    timeout: 60_000,
  },
};
