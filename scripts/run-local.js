// 2026-03-16: 안전 실행 스크립트 추가. 포트 충돌 방지와 종료 시 자식 프로세스 정리를 자동화하기 위해 사용.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");

const { killPort } = require("./shared/kill-port-lib");

const port = Number(process.env.PORT || 3210);
const startupTimeoutMs = Number(process.env.STARTUP_TIMEOUT_MS || 15_000);
let childProcess = null;

/**
 * Start the local server after clearing a conflicting port.
 * @returns {Promise<void>}
 */
async function main() {
  await killPort(port);

  childProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: process.env
  });

  bindCleanupSignals();
  await waitForStartup(childProcess, startupTimeoutMs);
  await once(childProcess, "exit");
}

/**
 * Wait until the process survives the startup window.
 * @param {import("node:child_process").ChildProcess} child Running child process.
 * @param {number} timeoutMs Startup grace period.
 * @returns {Promise<void>}
 */
async function waitForStartup(child, timeoutMs) {
  const exitPromise = once(child, "exit").then(([code, signal]) => {
    throw new Error(`Server stopped during startup (code=${code}, signal=${signal}).`);
  });

  await Promise.race([
    delay(timeoutMs),
    exitPromise
  ]);
}

/**
 * Ensure the spawned server is terminated on every exit path.
 * @returns {void}
 */
function bindCleanupSignals() {
  const cleanup = () => {
    if (!childProcess || childProcess.killed) {
      return;
    }

    childProcess.kill("SIGTERM");
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  process.on("exit", cleanup);
}

main().catch((error) => {
  if (childProcess && !childProcess.killed) {
    childProcess.kill("SIGTERM");
  }

  console.error(error.message || error);
  process.exitCode = 1;
});
