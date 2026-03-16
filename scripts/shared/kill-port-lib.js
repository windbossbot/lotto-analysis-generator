// 2026-03-16: 포트 정리 로직 공용화. CLI와 안전 실행 스크립트가 같은 로직을 재사용하도록 분리.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

/**
 * Close listeners on the requested TCP port.
 * @param {number} port TCP port to inspect.
 * @returns {Promise<number[]>} Closed process ids.
 */
async function killPort(port) {
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("A valid TCP port is required.");
  }

  const command = process.platform === "win32" ? "netstat" : "lsof";
  const args =
    process.platform === "win32"
      ? ["-ano", "-p", "tcp"]
      : ["-ti", `tcp:${port}`];

  const { stdout } = await execFileAsync(command, args, {
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });

  const pids =
    process.platform === "win32"
      ? collectWindowsPids(stdout, port)
      : collectUnixPids(stdout);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw error;
      }
    }
  }

  return pids;
}

/**
 * Extract Windows PIDs that are listening on a port.
 * @param {string} stdout Raw netstat output.
 * @param {number} port TCP port to match.
 * @returns {number[]} Unique process ids.
 */
function collectWindowsPids(stdout, port) {
  const lines = stdout.split(/\r?\n/);
  const matched = new Set();

  for (const line of lines) {
    if (!line.includes(`:${port}`) || !line.includes("LISTENING")) {
      continue;
    }

    const parts = line.trim().split(/\s+/);
    const pid = Number(parts.at(-1));
    if (Number.isInteger(pid)) {
      matched.add(pid);
    }
  }

  return [...matched];
}

/**
 * Extract Unix PIDs from lsof output.
 * @param {string} stdout Raw lsof output.
 * @returns {number[]} Unique process ids.
 */
function collectUnixPids(stdout) {
  return [...new Set(
    stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid))
  )];
}

module.exports = {
  killPort
};
