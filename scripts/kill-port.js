// 2026-03-16: 개발용 포트 정리 스크립트 추가. 실행 전 포트 충돌을 줄이기 위해 사용.
const { killPort } = require("./shared/kill-port-lib");

async function main() {
  const port = Number(process.argv[2] || process.env.PORT || 3210);
  const closedPids = await killPort(port);
  const label = closedPids.length ? closedPids.join(", ") : "none";
  console.log(`Closed listeners on port ${port}: ${label}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
