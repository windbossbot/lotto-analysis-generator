// 2026-03-16: 임시 로그와 캐시 정리 스크립트 추가. 테스트 후 작업 폴더를 말끔히 유지하기 위해 사용.
const fs = require("node:fs");
const path = require("node:path");

const TEMP_TARGETS = [
  path.join(__dirname, "..", "output"),
  path.join(__dirname, "..", ".playwright-cli")
];

/**
 * Remove known temporary directories if they exist.
 * @returns {string[]} Removed directory paths.
 */
function cleanupTemp() {
  const removedPaths = [];

  for (const targetPath of TEMP_TARGETS) {
    if (!fs.existsSync(targetPath)) {
      continue;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    removedPaths.push(targetPath);
  }

  return removedPaths;
}

const removedPaths = cleanupTemp();
console.log(removedPaths.length ? removedPaths.join("\n") : "No temp files to clean.");
