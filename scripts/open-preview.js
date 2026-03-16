// 2026-03-16: 미리보기 자동화 스크립트 추가. 서버 확인, 재기동, 브라우저 열기를 한 번에 처리하기 위해 사용.
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { promisify } = require("node:util");
const { setTimeout: delay } = require("node:timers/promises");

const { killPort } = require("./shared/kill-port-lib");

const execFileAsync = promisify(execFile);
const projectRoot = path.join(__dirname, "..");
const port = Number(process.env.PORT || 3210);
const previewUrl = `http://127.0.0.1:${port}`;
const healthUrl = `${previewUrl}/health`;
const startupTimeoutMs = Number(process.env.STARTUP_TIMEOUT_MS || 15_000);
const pollIntervalMs = 500;

/**
 * Ensure the preview server is reachable, restarting it if needed.
 * @returns {Promise<void>}
 */
async function ensurePreviewServer() {
  if (await isServerHealthy()) {
    return;
  }

  await killPort(port);
  startDetachedServer();
  await waitForHealth(startupTimeoutMs);
}

/**
 * Check whether the health endpoint responds successfully.
 * @returns {Promise<boolean>}
 */
function isServerHealthy() {
  return new Promise((resolve) => {
    const request = http.get(healthUrl, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });

    request.on("error", () => resolve(false));
  });
}

/**
 * Start the Node server in detached mode so it survives the launcher process.
 * @returns {void}
 */
function startDetachedServer() {
  const outputDir = path.join(projectRoot, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const stdoutFd = fs.openSync(path.join(outputDir, "preview.log"), "a");
  const stderrFd = fs.openSync(path.join(outputDir, "preview.err.log"), "a");

  const child = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: projectRoot,
    env: process.env,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true
  });

  child.unref();
}

/**
 * Poll the health endpoint until it responds or times out.
 * @param {number} timeoutMs Maximum wait time.
 * @returns {Promise<void>}
 */
async function waitForHealth(timeoutMs) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await isServerHealthy()) {
      return;
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Preview server did not become ready within ${timeoutMs}ms.`);
}

/**
 * Open the preview URL in the default browser.
 * @returns {Promise<void>}
 */
async function openBrowser() {
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", previewUrl], { windowsHide: true });
    return;
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", [previewUrl]);
    return;
  }

  await execFileAsync("xdg-open", [previewUrl]);
}

async function main() {
  await ensurePreviewServer();
  await openBrowser();
  console.log(`Preview ready: ${previewUrl}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
