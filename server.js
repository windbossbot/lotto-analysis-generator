const express = require("express");
const fs = require("fs");
const https = require("https");
const path = require("path");

const app = express();
const port = process.env.PORT || 3210;
const dataDir = path.join(__dirname, "data");
const drawsFile = path.join(dataDir, "lotto-draws.json");
const syncStateFile = path.join(dataDir, "lotto-sync-state.json");
const appCacheFile = path.join(dataDir, "lotto-app-cache.json");
const LOTTO_MIN = 1;
const LOTTO_MAX = 45;
const PICKS_PER_DRAW = 6;
const RECOMMENDATION_COUNT = 5;
const LOTTO_RESULT_PAGE = "https://www.dhlottery.co.kr/lt645/result";
const LOTTO_BATCH_API = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=";
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKTEST_WARMUP_DRAWS = 80;
const BACKTEST_WINDOW = 60;
const LIVE_CANDIDATE_POOL_SIZE = 180;
const BACKTEST_CANDIDATE_POOL_SIZE = 10;
const BACKTEST_ROUNDS = 5;
const TARGET_HIT3_RATE_MIN = 1;
const TARGET_HIT3_RATE_MAX = 7;
const TARGET_HIT3_RATE_STEP = 0.1;
const CORE_RECALC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const WEIGHT_FLATTEN_EXPONENT = 0.84;
const REUSE_PENALTY_PER_PICK = 18;
const MAX_NUMBER_USAGE_PER_BATCH = 3;
let drawsMemoryCache = null;
let syncInFlight = null;
let appCacheMemory = null;
const snapshotCache = {
  coreKey: null,
  coreValue: null,
  backtestKey: null,
  backtestValue: null
};

const defaultDraws = [
  { round: 101, drawDate: "2026-01-03", numbers: [3, 11, 19, 24, 33, 41], bonus: 7 },
  { round: 102, drawDate: "2026-01-10", numbers: [6, 9, 14, 28, 37, 44], bonus: 2 },
  { round: 103, drawDate: "2026-01-17", numbers: [1, 8, 21, 26, 34, 42], bonus: 16 },
  { round: 104, drawDate: "2026-01-24", numbers: [5, 12, 18, 29, 31, 45], bonus: 22 },
  { round: 105, drawDate: "2026-01-31", numbers: [4, 7, 15, 23, 38, 40], bonus: 12 },
  { round: 106, drawDate: "2026-02-07", numbers: [2, 13, 17, 27, 35, 43], bonus: 24 },
  { round: 107, drawDate: "2026-02-14", numbers: [10, 16, 20, 25, 36, 39], bonus: 5 },
  { round: 108, drawDate: "2026-02-21", numbers: [1, 9, 22, 30, 32, 41], bonus: 18 },
  { round: 109, drawDate: "2026-02-28", numbers: [6, 14, 19, 27, 34, 45], bonus: 11 },
  { round: 110, drawDate: "2026-03-07", numbers: [8, 12, 24, 28, 37, 40], bonus: 3 }
];

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(drawsFile)) {
    fs.writeFileSync(drawsFile, `${JSON.stringify(defaultDraws, null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(syncStateFile)) {
    fs.writeFileSync(syncStateFile, `${JSON.stringify({ lastSyncedAt: null }, null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(appCacheFile)) {
    fs.writeFileSync(
      appCacheFile,
      `${JSON.stringify({ core: null, backtest: null }, null, 2)}\n`,
      "utf8"
    );
  }
}

function readDraws() {
  ensureStorage();
  if (drawsMemoryCache) {
    return drawsMemoryCache.map((draw) => ({ ...draw, numbers: [...draw.numbers] }));
  }
  const raw = fs.readFileSync(drawsFile, "utf8");
  const parsed = JSON.parse(raw);
  drawsMemoryCache = Array.isArray(parsed) ? parsed.map(normalizeDraw).filter(Boolean) : [];
  return drawsMemoryCache.map((draw) => ({ ...draw, numbers: [...draw.numbers] }));
}

function writeDraws(draws) {
  ensureStorage();
  drawsMemoryCache = draws.map((draw) => ({ ...draw, numbers: [...draw.numbers] }));
  fs.writeFileSync(drawsFile, `${JSON.stringify(draws, null, 2)}\n`, "utf8");
}

function readSyncState() {
  ensureStorage();
  const raw = fs.readFileSync(syncStateFile, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return { lastSyncedAt: null };
  }
}

function writeSyncState(syncState) {
  ensureStorage();
  fs.writeFileSync(syncStateFile, `${JSON.stringify(syncState, null, 2)}\n`, "utf8");
}

function readAppCache() {
  ensureStorage();
  if (appCacheMemory) {
    return JSON.parse(JSON.stringify(appCacheMemory));
  }

  const raw = fs.readFileSync(appCacheFile, "utf8");
  try {
    appCacheMemory = JSON.parse(raw);
  } catch {
    appCacheMemory = { core: null, backtest: null };
  }

  return JSON.parse(JSON.stringify(appCacheMemory));
}

function writeAppCache(cache) {
  ensureStorage();
  appCacheMemory = JSON.parse(JSON.stringify(cache));
  fs.writeFileSync(appCacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function sortNumbers(numbers) {
  return [...numbers].sort((a, b) => a - b);
}

function normalizeDraw(draw) {
  const round = Number(draw?.round);
  const drawDate = String(draw?.drawDate || "").trim();
  const bonus = draw?.bonus === undefined || draw?.bonus === null || draw?.bonus === ""
    ? null
    : Number(draw.bonus);
  const numbers = Array.isArray(draw?.numbers)
    ? draw.numbers.map(Number).filter((value) => Number.isInteger(value))
    : [];

  if (!Number.isInteger(round) || !drawDate || numbers.length !== PICKS_PER_DRAW) {
    return null;
  }

  return {
    round,
    drawDate,
    numbers: sortNumbers(numbers),
    bonus: Number.isInteger(bonus) ? bonus : null
  };
}

function validateNumberRange(numbers) {
  return numbers.every((number) => number >= LOTTO_MIN && number <= LOTTO_MAX);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`복권 데이터를 불러오지 못했습니다. status=${response.statusCode}`));
          response.resume();
          return;
        }

        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`복권 페이지를 불러오지 못했습니다. status=${response.statusCode}`));
          response.resume();
          return;
        }

        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => resolve(raw));
      })
      .on("error", reject);
  });
}

function parseLatestRound(html) {
  const matches = [...html.matchAll(/<option value="(\d+)">\s*\1회\s*<\/option>/g)];
  const rounds = matches.map((match) => Number(match[1])).filter((value) => Number.isInteger(value));
  return rounds.length ? Math.max(...rounds) : null;
}

function normalizeBatchDraw(item) {
  const round = Number(item?.ltEpsd);
  const drawDateRaw = String(item?.ltRflYmd || "").trim();
  const numbers = [
    item?.tm1WnNo,
    item?.tm2WnNo,
    item?.tm3WnNo,
    item?.tm4WnNo,
    item?.tm5WnNo,
    item?.tm6WnNo
  ]
    .map(Number)
    .filter((value) => Number.isInteger(value));
  const bonus = Number(item?.bnsWnNo);

  if (!Number.isInteger(round) || numbers.length !== PICKS_PER_DRAW || !validateNumberRange(numbers)) {
    return null;
  }

  return {
    round,
    drawDate:
      drawDateRaw.length === 8
        ? `${drawDateRaw.slice(0, 4)}-${drawDateRaw.slice(4, 6)}-${drawDateRaw.slice(6, 8)}`
        : drawDateRaw,
    numbers: sortNumbers(numbers),
    bonus: Number.isInteger(bonus) ? bonus : null
  };
}

async function fetchBatchDraws(round) {
  const payload = await fetchJson(`${LOTTO_BATCH_API}${round}`);
  const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  return list.map(normalizeBatchDraw).filter(Boolean);
}

async function performSyncLatestDraws(force = false) {
  ensureStorage();

  const syncState = readSyncState();
  const lastSyncedAt = syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt) : null;
  if (
    !force &&
    lastSyncedAt &&
    !Number.isNaN(lastSyncedAt.getTime()) &&
    Date.now() - lastSyncedAt.getTime() < SYNC_INTERVAL_MS
  ) {
    return { updated: false, draws: readDraws() };
  }

  const localDraws = readDraws().sort((a, b) => a.round - b.round);
  const localLatestRound = localDraws[localDraws.length - 1]?.round || 0;
  const resultPage = await fetchText(LOTTO_RESULT_PAGE);
  const latestRound = parseLatestRound(resultPage);

  if (!latestRound) {
    throw new Error("최신 회차 정보를 찾지 못했습니다.");
  }

  if (localLatestRound >= latestRound) {
    writeSyncState({
      lastSyncedAt: new Date().toISOString(),
      latestRound: localLatestRound
    });

    return {
      updated: false,
      draws: localDraws,
      fetchedCount: 0
    };
  }

  const byRound = new Map(localDraws.map((draw) => [draw.round, draw]));
  let fetchedCount = 0;
  const fetchStartRound = localLatestRound > 0 ? latestRound : latestRound;
  const fetchFloorRound = localLatestRound > 0 ? localLatestRound + 1 : 1;

  for (let round = fetchStartRound; round >= fetchFloorRound; round -= 10) {
    const batch = await fetchBatchDraws(round);
    batch.forEach((draw) => {
      if (draw.round < fetchFloorRound) {
        return;
      }
      const before = byRound.has(draw.round);
      byRound.set(draw.round, draw);
      if (!before) {
        fetchedCount += 1;
      }
    });

    if (round <= fetchFloorRound + 9) {
      break;
    }
  }

  const merged = [...byRound.values()].sort((a, b) => a.round - b.round);
  writeDraws(merged);
  if (fetchedCount > 0) {
    invalidateCalculationCache();
  }
  snapshotCache.coreKey = null;
  snapshotCache.coreValue = null;
  snapshotCache.backtestKey = null;
  snapshotCache.backtestValue = null;

  writeSyncState({
    lastSyncedAt: new Date().toISOString(),
    latestRound: merged[merged.length - 1]?.round || null
  });

  return {
    updated: fetchedCount > 0,
    draws: merged,
    fetchedCount
  };
}

async function syncLatestDraws(force = false) {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = performSyncLatestDraws(force).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

function validateDrawInput(body) {
  const round = Number(body?.round);
  const drawDate = String(body?.drawDate || "").trim();
  const bonus = body?.bonus === undefined || body?.bonus === null || body?.bonus === ""
    ? null
    : Number(body.bonus);
  const numbers = String(body?.numbers || "")
    .split(/[^0-9]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  if (!Number.isInteger(round) || round <= 0) {
    return { error: "회차는 1 이상의 숫자로 입력해 주세요." };
  }

  if (!drawDate) {
    return { error: "추첨일을 입력해 주세요." };
  }

  if (numbers.length !== PICKS_PER_DRAW) {
    return { error: "번호는 6개를 입력해 주세요." };
  }

  if (new Set(numbers).size !== PICKS_PER_DRAW) {
    return { error: "중복되지 않는 번호 6개가 필요합니다." };
  }

  if (!validateNumberRange(numbers)) {
    return { error: "번호는 1부터 45 사이여야 합니다." };
  }

  if (bonus !== null && (!Number.isInteger(bonus) || bonus < LOTTO_MIN || bonus > LOTTO_MAX || numbers.includes(bonus))) {
    return { error: "보너스 번호는 1부터 45 사이의 중복되지 않는 숫자여야 합니다." };
  }

  return {
    value: {
      round,
      drawDate,
      numbers: sortNumbers(numbers),
      bonus
    }
  };
}

function numberStats(draws) {
  const counts = Array.from({ length: LOTTO_MAX }, (_, index) => ({
    number: index + 1,
    count: 0,
    lastSeenRound: null,
    missCount: draws.length
  }));

  draws.forEach((draw, drawIndex) => {
    draw.numbers.forEach((number) => {
      const target = counts[number - 1];
      target.count += 1;
      if (target.lastSeenRound === null || draw.round > target.lastSeenRound) {
        target.lastSeenRound = draw.round;
        target.missCount = drawIndex;
      }
    });
  });

  return counts;
}

function buildAnalysis(draws) {
  const sortedDraws = [...draws].sort((a, b) => b.round - a.round);
  const stats = numberStats(sortedDraws);
  const recentDraws = sortedDraws.slice(0, 10);
  const totalNumberPicks = draws.length * PICKS_PER_DRAW;
  const averageHitRate = totalNumberPicks / LOTTO_MAX || 0;

  const hotNumbers = [...stats]
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, 6);
  const coldNumbers = [...stats]
    .sort((a, b) => b.missCount - a.missCount || a.count - b.count || a.number - b.number)
    .slice(0, 6);

  const sums = recentDraws.map((draw) => draw.numbers.reduce((total, value) => total + value, 0));
  const oddEven = recentDraws.map((draw) => {
    const odd = draw.numbers.filter((number) => number % 2 === 1).length;
    return { odd, even: PICKS_PER_DRAW - odd };
  });

  const sectionCounts = [0, 0, 0, 0, 0];
  const endDigitCounts = Array.from({ length: 10 }, () => 0);
  const acValues = [];
  const lowHighBalances = [];
  let consecutiveDrawCount = 0;
  recentDraws.forEach((draw) => {
    draw.numbers.forEach((number) => {
      sectionCounts[Math.min(4, Math.floor((number - 1) / 10))] += 1;
      endDigitCounts[number % 10] += 1;
    });

    const consecutiveCount = draw.numbers.slice(1).filter((number, index) => number - draw.numbers[index] === 1).length;
    if (consecutiveCount > 0) {
      consecutiveDrawCount += 1;
    }
    acValues.push(calculateAcValue(draw.numbers));
    lowHighBalances.push(draw.numbers.filter((number) => number <= 22).length);
  });

  const pairMap = new Map();
  recentDraws.forEach((draw) => {
    for (let index = 0; index < draw.numbers.length - 1; index += 1) {
      for (let nextIndex = index + 1; nextIndex < draw.numbers.length; nextIndex += 1) {
        const key = `${draw.numbers[index]}-${draw.numbers[nextIndex]}`;
        pairMap.set(key, (pairMap.get(key) || 0) + 1);
      }
    }
  });

  const topPairs = [...pairMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([key, count]) => ({
      pair: key.split("-").map(Number),
      count
    }));

  const carryOverNumbers =
    sortedDraws.length >= 2
      ? sortedDraws[0].numbers.filter((number) => sortedDraws[1].numbers.includes(number))
      : [];

  return {
    drawCount: draws.length,
    latestRound: sortedDraws[0]?.round || null,
    latestDrawDate: sortedDraws[0]?.drawDate || "",
    averageHitRate: Number(averageHitRate.toFixed(2)),
    hotNumbers,
    coldNumbers,
    numberStats: stats,
    patternSummary: {
      averageSum: sums.length ? Math.round(sums.reduce((total, value) => total + value, 0) / sums.length) : 0,
      averageOddCount: oddEven.length
        ? Number((oddEven.reduce((total, value) => total + value.odd, 0) / oddEven.length).toFixed(1))
        : 0,
      sectionCounts,
      averageAc: acValues.length
        ? Number((acValues.reduce((total, value) => total + value, 0) / acValues.length).toFixed(1))
        : 0,
      averageLowCount: lowHighBalances.length
        ? Number((lowHighBalances.reduce((total, value) => total + value, 0) / lowHighBalances.length).toFixed(1))
        : 0,
      endDigitCounts,
      consecutiveDrawCount,
      topPairs,
      carryOverNumbers
    },
    recentDraws
  };
}

function calculateAcValue(numbers) {
  const diffs = new Set();
  for (let index = 0; index < numbers.length - 1; index += 1) {
    for (let nextIndex = index + 1; nextIndex < numbers.length; nextIndex += 1) {
      diffs.add(numbers[nextIndex] - numbers[index]);
    }
  }
  return diffs.size - (numbers.length - 1);
}

function weightedNumberPool(stats) {
  return stats.map((item) => {
    const coldBoost = Math.min(6, item.missCount) * 1.6;
    const underusedBoost = Math.max(0, 3.5 - item.count) * 1.25;
    const steadyBonus = item.count >= 1 && item.count <= 3 ? 1.4 : 0;
    return {
      number: item.number,
      weight: 1 + coldBoost + underusedBoost + steadyBonus
    };
  });
}

function buildWeightedProfile(draws) {
  const sortedDraws = [...draws].sort((a, b) => b.round - a.round);
  const stats = Array.from({ length: LOTTO_MAX }, (_, index) => ({
    number: index + 1,
    weightedCount: 0,
    recentCount: 0,
    pairWeight: 0
  }));
  const pairScores = new Map();

  sortedDraws.forEach((draw, drawIndex) => {
    const recencyWeight = Math.max(0.15, 1 - drawIndex * 0.018);

    draw.numbers.forEach((number) => {
      const target = stats[number - 1];
      target.weightedCount += recencyWeight;
      if (drawIndex < 15) {
        target.recentCount += 1;
      }
    });

    for (let index = 0; index < draw.numbers.length - 1; index += 1) {
      for (let nextIndex = index + 1; nextIndex < draw.numbers.length; nextIndex += 1) {
        const key = `${draw.numbers[index]}-${draw.numbers[nextIndex]}`;
        pairScores.set(key, (pairScores.get(key) || 0) + recencyWeight);
      }
    }
  });

  return { stats, pairScores };
}

function scoreNumbersFromHistory(draws) {
  const analysis = buildAnalysis(draws);
  const weightedProfile = buildWeightedProfile(draws);
  const hotSet = new Set(analysis.hotNumbers.map((item) => item.number));
  const coldSet = new Set(analysis.coldNumbers.map((item) => item.number));

  return Array.from({ length: LOTTO_MAX }, (_, index) => {
    const base = analysis.numberStats[index];
    const weighted = weightedProfile.stats[index];
    const hotBonus = hotSet.has(base.number) ? 4 : 0;
    const coldBonus = coldSet.has(base.number) ? 3 : 0;
    const overdueBonus = Math.min(12, base.missCount * 0.65);
    const weightedBonus = weighted.weightedCount * 1.35;
    const recentBonus = weighted.recentCount * 1.4;

    return {
      number: base.number,
      score: Number((weightedBonus + recentBonus + overdueBonus + hotBonus + coldBonus).toFixed(3))
    };
  });
}

function buildBacktestStats(draws) {
  const chronological = [...draws].sort((a, b) => a.round - b.round);
  const perNumber = Array.from({ length: LOTTO_MAX }, (_, index) => ({
    number: index + 1,
    picks: 0,
    hits: 0,
    scoreTotal: 0
  }));
  let rounds = 0;

  for (let index = BACKTEST_WARMUP_DRAWS; index < chronological.length; index += 1) {
    const trainStart = Math.max(0, index - BACKTEST_WINDOW);
    const trainDraws = chronological.slice(trainStart, index);
    const targetDraw = chronological[index];
    const ranked = scoreNumbersFromHistory(trainDraws).sort((a, b) => b.score - a.score || a.number - b.number);
    const topCandidates = new Set(ranked.slice(0, 18).map((item) => item.number));

    ranked.forEach((item) => {
      const bucket = perNumber[item.number - 1];
      if (topCandidates.has(item.number)) {
        bucket.picks += 1;
      }
      if (targetDraw.numbers.includes(item.number)) {
        bucket.hits += 1;
      }
      bucket.scoreTotal += item.score;
    });
    rounds += 1;
  }

  return perNumber.map((item) => ({
    number: item.number,
    hitRate: item.picks > 0 ? item.hits / item.picks : 0,
    pickRate: rounds > 0 ? item.picks / rounds : 0,
    meanScore: rounds > 0 ? item.scoreTotal / rounds : 0
  }));
}

function buildNextNumberRanking(draws) {
  const scoreMap = new Map(scoreNumbersFromHistory(draws).map((item) => [item.number, item]));
  const backtestMap = new Map(buildBacktestStats(draws).map((item) => [item.number, item]));

  return Array.from({ length: LOTTO_MAX }, (_, index) => {
    const number = index + 1;
    const recentScore = scoreMap.get(number)?.score || 0;
    const hitRate = backtestMap.get(number)?.hitRate || 0;
    const pickRate = backtestMap.get(number)?.pickRate || 0;
    const total = (recentScore * 2.1) + (hitRate * 120) + (pickRate * 48);

    return {
      rank: 0,
      number,
      totalScore: Number(total.toFixed(2)),
      recentScore: Number(recentScore.toFixed(2)),
      backtestHitRate: Number((hitRate * 100).toFixed(1)),
      backtestPickRate: Number((pickRate * 100).toFixed(1))
    };
  })
    .sort((a, b) => b.totalScore - a.totalScore || a.number - b.number)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

function clampTargetHit3Rate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(TARGET_HIT3_RATE_MAX, Math.max(TARGET_HIT3_RATE_MIN, numeric));
}

/**
 * Normalize one selectable lotto number from user input.
 * @param {number|string|null|undefined} value Requested number.
 * @returns {number|null} Normalized lotto number or null.
 */
function normalizeSelectableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < LOTTO_MIN || numeric > LOTTO_MAX) {
    return null;
  }

  return numeric;
}

function normalizeFixedNumber(value) {
  return normalizeSelectableNumber(value);
}

function normalizeExcludedNumber(value) {
  return normalizeSelectableNumber(value);
}

/**
 * Validate include and exclude number constraints.
 * @param {number|string|null|undefined} fixedNumber Required number.
 * @param {number|string|null|undefined} excludedNumber Blocked number.
 * @returns {{ fixedNumber: number|null, excludedNumber: number|null, error: string|null }}
 */
function resolveNumberConstraints(fixedNumber, excludedNumber) {
  const normalizedFixedNumber = normalizeFixedNumber(fixedNumber);
  const normalizedExcludedNumber = normalizeExcludedNumber(excludedNumber);

  if (
    normalizedFixedNumber !== null &&
    normalizedExcludedNumber !== null &&
    normalizedFixedNumber === normalizedExcludedNumber
  ) {
    return {
      fixedNumber: normalizedFixedNumber,
      excludedNumber: normalizedExcludedNumber,
      error: "포함 번호와 제외 번호는 같을 수 없습니다."
    };
  }

  return {
    fixedNumber: normalizedFixedNumber,
    excludedNumber: normalizedExcludedNumber,
    error: null
  };
}

function pickWeighted(pool, blockedNumbers) {
  const available = pool.filter((item) => !blockedNumbers.has(item.number));
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const item of available) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.number;
    }
  }

  return available[available.length - 1]?.number || null;
}

function isBalancedSet(numbers) {
  const sorted = sortNumbers(numbers);
  const odd = sorted.filter((number) => number % 2 === 1).length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const sections = new Set(sorted.map((number) => Math.floor((number - 1) / 10))).size;

  return odd >= 2 && odd <= 4 && sum >= 100 && sum <= 175 && sections >= 3;
}

function uniqueKey(numbers) {
  return sortNumbers(numbers).join("-");
}

/**
 * Build a deterministic fallback set that still respects include/exclude rules.
 * @param {{ number: number, weight: number }[]} pool Candidate pool.
 * @param {Set<number>} requiredNumbers Required picks.
 * @param {Set<number>} blockedNumbers Excluded picks.
 * @returns {number[]|null} Candidate set.
 */
function buildFallbackCandidate(pool, requiredNumbers, blockedNumbers) {
  const numbers = [...requiredNumbers];
  const ordered = [...pool]
    .filter((item) => !requiredNumbers.has(item.number) && !blockedNumbers.has(item.number))
    .sort((a, b) => b.weight - a.weight || a.number - b.number);

  for (const item of ordered) {
    if (numbers.length === PICKS_PER_DRAW) {
      break;
    }
    numbers.push(item.number);
  }

  if (numbers.length !== PICKS_PER_DRAW) {
    return null;
  }

  return sortNumbers(numbers);
}

function generateRecommendationSet(pool, existingKeys, options = {}) {
  const requiredNumbers = new Set(options.requiredNumbers || []);
  const blockedNumbers = new Set(options.blockedNumbers || []);

  if ([...requiredNumbers].some((number) => blockedNumbers.has(number))) {
    return null;
  }

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const picked = new Set(requiredNumbers);

    while (picked.size < PICKS_PER_DRAW) {
      const next = pickWeighted(pool, new Set([...picked, ...blockedNumbers]));
      if (next === null) {
        break;
      }
      picked.add(next);
    }

    if (picked.size !== PICKS_PER_DRAW) {
      continue;
    }

    const numbers = sortNumbers([...picked]);
    const key = uniqueKey(numbers);

    if (existingKeys.has(key) || numbers.some((number) => blockedNumbers.has(number)) || !isBalancedSet(numbers)) {
      continue;
    }

    existingKeys.add(key);
    return numbers;
  }

  const fallback = buildFallbackCandidate(pool, requiredNumbers, blockedNumbers);
  if (!fallback || existingKeys.has(uniqueKey(fallback)) || !isBalancedSet(fallback)) {
    return null;
  }

  existingKeys.add(uniqueKey(fallback));
  return fallback;
}

function generateSeededCandidate(mode, scoreMap, backtestMap, pairScores, existingKeys, options = {}) {
  const orderedNumbers = [...scoreMap.values()].sort((a, b) => b.score - a.score || a.number - b.number);
  const requiredNumbers = new Set(options.requiredNumbers || []);
  const blockedNumbers = new Set(options.blockedNumbers || []);
  const seeded = new Set(requiredNumbers);

  if (mode === "top-score") {
    orderedNumbers.slice(0, 9).forEach((item) => {
      if (!blockedNumbers.has(item.number) && seeded.size < 3) {
        seeded.add(item.number);
      }
    });
  }

  if (mode === "backtest-heavy") {
    [...backtestMap.values()]
      .sort((a, b) => (b.hitRate + b.pickRate * 0.4) - (a.hitRate + a.pickRate * 0.4) || a.number - b.number)
      .slice(0, 10)
      .forEach((item) => {
        if (!blockedNumbers.has(item.number) && seeded.size < 3) {
          seeded.add(item.number);
        }
      });
  }

  if (mode === "hot-cold-mix") {
    orderedNumbers.slice(0, 5).forEach((item) => {
      if (!blockedNumbers.has(item.number) && seeded.size < 2) {
        seeded.add(item.number);
      }
    });
    orderedNumbers.slice(-8).forEach((item) => {
      if (!blockedNumbers.has(item.number) && seeded.size < 3) {
        seeded.add(item.number);
      }
    });
  }

  if (mode === "pair-anchored") {
    const topPair = [...pairScores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      ?.split("-")
      .map(Number);

    (topPair || []).forEach((number) => {
      if (!blockedNumbers.has(number)) {
        seeded.add(number);
      }
    });
  }

  const pool = orderedNumbers.map((item) => {
    const backtest = backtestMap.get(item.number);
    return {
      number: item.number,
      weight: 1 + item.score + (backtest?.hitRate || 0) * 25 + (backtest?.pickRate || 0) * 8
    };
  });

  while (seeded.size < PICKS_PER_DRAW) {
    const next = pickWeighted(pool, new Set([...seeded, ...blockedNumbers]));
    if (next === null) {
      break;
    }
    seeded.add(next);
  }

  const numbers = sortNumbers([...seeded]);
  if (numbers.length !== PICKS_PER_DRAW || numbers.some((number) => blockedNumbers.has(number))) {
    return null;
  }

  const key = uniqueKey(numbers);
  if (existingKeys.has(key)) {
    return null;
  }
  existingKeys.add(key);
  return numbers;
}

/**
 * Build reusable number-scoring context once per recommendation request.
 * @param {Array<{ round: number, drawDate: string, numbers: number[] }>} draws Lotto draws.
 * @returns {{
 *   analysis: ReturnType<typeof buildAnalysis>,
 *   scoreMap: Map<number, { number: number, score: number }>,
 *   backtestMap: Map<number, { number: number, hitRate: number, pickRate: number }>,
 *   pairScores: Map<string, number>,
 *   weightedPool: { number: number, weight: number }[],
 *   topRankSet: Set<number>,
 *   carrySet: Set<number>,
 *   coldSet: Set<number>
 * }}
 */
function buildRecommendationContext(draws) {
  const analysis = buildAnalysis(draws);
  const scoreMap = new Map(scoreNumbersFromHistory(draws).map((item) => [item.number, item]));
  const backtestMap = new Map(buildBacktestStats(draws).map((item) => [item.number, item]));
  const pairScores = buildWeightedProfile(draws).pairScores;
  const weightedPool = [...scoreMap.values()].map((item) => {
    const rawWeight = 1 + item.score + ((backtestMap.get(item.number)?.hitRate || 0) * 30);
    return {
      number: item.number,
      weight: Math.max(1, Number(Math.pow(rawWeight, WEIGHT_FLATTEN_EXPONENT).toFixed(4)))
    };
  });

  return {
    analysis,
    scoreMap,
    backtestMap,
    pairScores,
    weightedPool,
    topRankSet: new Set([...scoreMap.values()].sort((a, b) => b.score - a.score).slice(0, 10).map((item) => item.number)),
    carrySet: new Set(analysis.patternSummary.carryOverNumbers || []),
    coldSet: new Set(analysis.coldNumbers.map((item) => item.number))
  };
}

function scoreCandidate(numbers, context) {
  const { scoreMap, backtestMap, pairScores, analysis, topRankSet, carrySet, coldSet } = context;
  const sorted = sortNumbers(numbers);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const odd = sorted.filter((number) => number % 2 === 1).length;
  const lowCount = sorted.filter((number) => number <= 22).length;
  const endDigitSet = new Set(sorted.map((number) => number % 10));
  const consecutivePairs = sorted.slice(1).filter((number, index) => number - sorted[index] === 1).length;
  const maxGap = Math.max(...sorted.slice(1).map((number, index) => number - sorted[index]));
  const sections = new Set(sorted.map((number) => Math.floor((number - 1) / 10))).size;
  const acValue = calculateAcValue(sorted);
  const topRankCount = sorted.filter((number) => topRankSet.has(number)).length;
  const carryCount = sorted.filter((number) => carrySet.has(number)).length;
  const coldCount = sorted.filter((number) => coldSet.has(number)).length;

  let numberScore = 0;
  let backtestScore = 0;
  let pairScore = 0;

  sorted.forEach((number) => {
    numberScore += scoreMap.get(number)?.score || 0;
    const backtest = backtestMap.get(number);
    backtestScore += ((backtest?.hitRate || 0) * 100) + ((backtest?.pickRate || 0) * 35);
  });

  for (let index = 0; index < sorted.length - 1; index += 1) {
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      pairScore += pairScores.get(`${sorted[index]}-${sorted[nextIndex]}`) || 0;
    }
  }

  let patternScore = 100;
  patternScore -= Math.abs(sum - analysis.patternSummary.averageSum) * 0.75;
  patternScore -= Math.abs(odd - Math.round(analysis.patternSummary.averageOddCount)) * 12;
  patternScore -= Math.abs(lowCount - Math.round(analysis.patternSummary.averageLowCount || 3)) * 7;
  patternScore -= consecutivePairs * 16;
  patternScore -= maxGap >= 18 ? 10 : 0;
  patternScore -= Math.abs(acValue - Math.round(analysis.patternSummary.averageAc || 7)) * 7;
  patternScore -= endDigitSet.size <= 3 ? 18 : 0;
  patternScore -= Math.max(0, topRankCount - 3) * 10;
  patternScore -= Math.max(0, carryCount - 2) * 8;
  patternScore += endDigitSet.size >= 5 ? 8 : 0;
  patternScore += coldCount >= 1 && coldCount <= 2 ? 5 : 0;
  patternScore += sections >= 4 ? 10 : sections >= 3 ? 4 : -14;
  if (sorted.join(",") === "1,2,3,4,5,6") {
    patternScore -= 120;
  }

  const totalScore = (numberScore * 2.2) + (backtestScore * 1.55) + (pairScore * 5.2) + patternScore;

  return {
    totalScore: Number(totalScore.toFixed(2)),
    breakdown: {
      numberScore: Number(numberScore.toFixed(2)),
      backtestScore: Number(backtestScore.toFixed(2)),
      pairScore: Number(pairScore.toFixed(2)),
      patternScore: Number(patternScore.toFixed(2))
    },
    profile: {
      sum,
      odd,
      even: PICKS_PER_DRAW - odd,
      consecutivePairs,
      sections,
      acValue,
      lowCount,
      endDigitVariety: endDigitSet.size
    }
  };
}

function pickDiversifiedRecommendations(candidates) {
  const selected = [];
  const remaining = [...candidates];
  const usageMap = new Map();

  while (remaining.length > 0 && selected.length < RECOMMENDATION_COUNT) {
    let bestIndex = 0;
    let bestAdjustedScore = -Infinity;

    remaining.forEach((candidate, index) => {
      const overusedCount = candidate.numbers.filter((number) => (usageMap.get(number) || 0) >= MAX_NUMBER_USAGE_PER_BATCH).length;
      const overlapPenalty = selected.reduce((penalty, picked) => {
        const overlap = candidate.numbers.filter((number) => picked.numbers.includes(number)).length;
        return penalty + (overlap >= 4 ? 85 : overlap * 9);
      }, 0);
      const reusePenalty = candidate.numbers.reduce(
        (penalty, number) => penalty + ((usageMap.get(number) || 0) * REUSE_PENALTY_PER_PICK),
        0
      );
      const adjustedScore =
        candidate.score +
        (candidate.historicalFit.hit3Rate * 4.5) -
        overlapPenalty -
        reusePenalty -
        (overusedCount * 120);

      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
      }
    });

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    chosen.numbers.forEach((number) => {
      usageMap.set(number, (usageMap.get(number) || 0) + 1);
    });
  }

  return selected;
}

function evaluateCandidateAgainstHistory(numbers, draws, limit = 260) {
  const sample = [...draws].sort((a, b) => b.round - a.round).slice(0, limit);
  let hit3Plus = 0;
  let hit4Plus = 0;
  let hit5Plus = 0;
  let totalMatches = 0;

  sample.forEach((draw) => {
    const matchCount = countMatches(numbers, draw.numbers);
    totalMatches += matchCount;
    if (matchCount >= 3) hit3Plus += 1;
    if (matchCount >= 4) hit4Plus += 1;
    if (matchCount >= 5) hit5Plus += 1;
  });

  const rounds = sample.length || 1;
  return {
    sampleRounds: sample.length,
    hit3Rate: Number(((hit3Plus / rounds) * 100).toFixed(2)),
    hit4Rate: Number(((hit4Plus / rounds) * 100).toFixed(2)),
    hit5Rate: Number(((hit5Plus / rounds) * 100).toFixed(2)),
    averageMatches: Number((totalMatches / rounds).toFixed(2))
  };
}

function labelRecommendation(numbers, analysis) {
  const hotSet = new Set(analysis.hotNumbers.map((item) => item.number));
  const coldSet = new Set(analysis.coldNumbers.map((item) => item.number));
  const carrySet = new Set(analysis.patternSummary.carryOverNumbers || []);
  const hotCount = numbers.filter((number) => hotSet.has(number)).length;
  const coldCount = numbers.filter((number) => coldSet.has(number)).length;
  const carryCount = numbers.filter((number) => carrySet.has(number)).length;

  if (coldCount >= 3) {
    return "콜드 보강형";
  }
  if (numbers.some((number, index) => index > 0 && number - numbers[index - 1] === 1)) {
    return "연속 리스크 혼합형";
  }
  if (carryCount >= 2) {
    return "연속 흐름형";
  }
  if (hotCount >= 3) {
    return "흐름 반영형";
  }
  return "균형 분산형";
}

function buildRecommendationCandidates(draws, options = {}) {
  const candidatePoolSize = options.candidatePoolSize || LIVE_CANDIDATE_POOL_SIZE;
  const constraints = resolveNumberConstraints(options.fixedNumber, options.excludedNumber);
  if (constraints.error) {
    return [];
  }

  const fixedNumber = constraints.fixedNumber;
  const excludedNumber = constraints.excludedNumber;
  const recommendationContext = options.context || buildRecommendationContext(draws);
  const { analysis, scoreMap, backtestMap, pairScores, weightedPool } = recommendationContext;
  const candidateKeys = new Set();
  const modes = ["top-score", "backtest-heavy", "hot-cold-mix", "pair-anchored", "balanced"];
  const candidates = [];
  const requiredNumbers = fixedNumber ? [fixedNumber] : [];
  const blockedNumbers = excludedNumber ? [excludedNumber] : [];

  for (let index = 0; index < candidatePoolSize; index += 1) {
    const mode = modes[index % modes.length];
    let numbers = null;

    if (mode === "balanced") {
      numbers = generateRecommendationSet(weightedPool, candidateKeys, {
        requiredNumbers,
        blockedNumbers
      });
    } else {
      numbers = generateSeededCandidate(mode, scoreMap, backtestMap, pairScores, candidateKeys, {
        requiredNumbers,
        blockedNumbers
      });
    }

    if (
      !numbers ||
      (fixedNumber && !numbers.includes(fixedNumber)) ||
      (excludedNumber && numbers.includes(excludedNumber)) ||
      !isBalancedSet(numbers)
    ) {
      continue;
    }

    const scored = scoreCandidate(numbers, recommendationContext);
    candidates.push({
      numbers,
      score: scored.totalScore,
      breakdown: scored.breakdown,
      profile: scored.profile,
      label: labelRecommendation(numbers, analysis)
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.numbers.join("-").localeCompare(b.numbers.join("-")))
    .map((item) => {
      const historicalFit = evaluateCandidateAgainstHistory(item.numbers, draws, 260);
      return {
        ...item,
        historicalFit
      };
    });
}

function buildRecommendations(draws, count = RECOMMENDATION_COUNT, options = {}) {
  const recommendationContext = options.context || buildRecommendationContext(draws);
  const candidates = buildRecommendationCandidates(draws, { ...options, context: recommendationContext });
  const selected = pickDiversifiedRecommendations(candidates).slice(0, count);
  const { scoreMap, backtestMap } = recommendationContext;

  const minScore = Math.min(...selected.map((item) => item.score), 0);
  const maxScore = Math.max(...selected.map((item) => item.score), 1);

  return selected.map((item, index) => ({
    ...(function buildCandidateMeta() {
      const historicalFit = evaluateCandidateAgainstHistory(item.numbers, draws, 260);
      const normalized = maxScore === minScore ? 1 : (item.score - minScore) / (maxScore - minScore);
      const modelChance = Number(
        Math.min(
          99.9,
          Math.max(1, (normalized * 45) + (historicalFit.hit3Rate * 5.5) + (historicalFit.averageMatches * 12))
        ).toFixed(1)
      );
      return {
        historicalFit,
        modelChance
      };
    })(),
    id: index + 1,
    label: item.label,
    numbers: item.numbers,
    sum: item.profile.sum,
    odd: item.profile.odd,
    even: item.profile.even,
    score: item.score,
    breakdown: item.breakdown,
    profileDetails: item.profile,
    anchors: item.numbers
      .map((number) => ({
        number,
        recentScore: Number((scoreMap.get(number)?.score || 0).toFixed(2)),
        backtestHitRate: Number((((backtestMap.get(number)?.hitRate) || 0) * 100).toFixed(1))
      }))
      .sort((a, b) => b.recentScore - a.recentScore || b.backtestHitRate - a.backtestHitRate)
      .slice(0, 3)
  }));
}

function buildCustomRecommendation(draws, targetHit3Rate, fixedNumber = null, excludedNumber = null, recommendationContext = null) {
  const clampedTarget = clampTargetHit3Rate(targetHit3Rate);
  if (clampedTarget === null) {
    return null;
  }

  const constraints = resolveNumberConstraints(fixedNumber, excludedNumber);
  if (constraints.error) {
    return { error: constraints.error };
  }

  const activeContext = recommendationContext || buildRecommendationContext(draws);

  const candidates = buildRecommendationCandidates(draws, {
    candidatePoolSize: LIVE_CANDIDATE_POOL_SIZE * 2,
    fixedNumber: constraints.fixedNumber,
    excludedNumber: constraints.excludedNumber,
    context: activeContext
  }).sort((a, b) => {
    const aDistance = Math.abs(a.historicalFit.hit3Rate - clampedTarget);
    const bDistance = Math.abs(b.historicalFit.hit3Rate - clampedTarget);
    return aDistance - bDistance || b.score - a.score;
  });

  const best = candidates[0];
  if (!best) {
    return null;
  }

  return {
    id: 1,
    label: [
      `${clampedTarget.toFixed(1)}% 목표`,
      constraints.fixedNumber ? `${constraints.fixedNumber}번 포함` : null,
      constraints.excludedNumber ? `${constraints.excludedNumber}번 제외` : null
    ].filter(Boolean).join(" · "),
    targetHit3Rate: clampedTarget,
    fixedNumber: constraints.fixedNumber,
    excludedNumber: constraints.excludedNumber,
    numbers: best.numbers,
    score: best.score,
    sum: best.profile.sum,
    odd: best.profile.odd,
    even: best.profile.even,
    breakdown: best.breakdown,
    profileDetails: best.profile,
    historicalFit: best.historicalFit,
    modelChance: Number(
      Math.min(
        99.9,
        Math.max(1, (best.historicalFit.hit3Rate * 6.4) + (best.historicalFit.averageMatches * 13) + (best.score / 55))
      ).toFixed(1)
    ),
    anchors: best.numbers.slice(0, 3).map((number) => ({ number }))
  };
}

function buildTargetRange(recommendations) {
  const rates = recommendations.map((item) => item.historicalFit.hit3Rate);
  const averageHit3Rate = rates.length
    ? Number((rates.reduce((total, value) => total + value, 0) / rates.length).toFixed(2))
    : 0;

  return {
    min: TARGET_HIT3_RATE_MIN,
    max: TARGET_HIT3_RATE_MAX,
    step: TARGET_HIT3_RATE_STEP,
    averageHit3Rate,
    defaultHit3Rate: Math.min(
      TARGET_HIT3_RATE_MAX,
      Math.max(TARGET_HIT3_RATE_MIN, Number(averageHit3Rate.toFixed(1)) || 3.5)
    )
  };
}

function countMatches(picks, winningNumbers) {
  return picks.filter((number) => winningNumbers.includes(number)).length;
}

function evaluateHitTier(matchCount) {
  if (matchCount >= 6) return "1등권";
  if (matchCount === 5) return "3등권";
  if (matchCount === 4) return "4등권";
  if (matchCount === 3) return "5등권";
  return "미적중";
}

function runBacktest(draws, rounds = 26) {
  const chronological = [...draws].sort((a, b) => a.round - b.round);
  const startIndex = Math.max(BACKTEST_WARMUP_DRAWS, chronological.length - rounds);
  const history = [];
  const summary = {
    testedRounds: 0,
    hit3Plus: 0,
    hit4Plus: 0,
    hit5Plus: 0,
    bestMatch: 0,
    averageBestMatch: 0
  };

  let bestMatchTotal = 0;

  for (let index = startIndex; index < chronological.length; index += 1) {
    const trainingDraws = chronological.slice(0, index);
    const target = chronological[index];
    const recommendations = buildRecommendations(trainingDraws, RECOMMENDATION_COUNT, {
      candidatePoolSize: BACKTEST_CANDIDATE_POOL_SIZE
    });
    const matches = recommendations.map((recommendation) => {
      const matchCount = countMatches(recommendation.numbers, target.numbers);
      return {
        setId: recommendation.id,
        numbers: recommendation.numbers,
        score: recommendation.score,
        matchCount,
        tier: evaluateHitTier(matchCount)
      };
    });
    const bestMatch = Math.max(...matches.map((item) => item.matchCount), 0);

    summary.testedRounds += 1;
    summary.bestMatch = Math.max(summary.bestMatch, bestMatch);
    summary.hit3Plus += matches.some((item) => item.matchCount >= 3) ? 1 : 0;
    summary.hit4Plus += matches.some((item) => item.matchCount >= 4) ? 1 : 0;
    summary.hit5Plus += matches.some((item) => item.matchCount >= 5) ? 1 : 0;
    bestMatchTotal += bestMatch;

    history.push({
      round: target.round,
      drawDate: target.drawDate,
      winningNumbers: target.numbers,
      bestMatch,
      matches
    });
  }

  summary.averageBestMatch = summary.testedRounds
    ? Number((bestMatchTotal / summary.testedRounds).toFixed(2))
    : 0;

  return {
    summary,
    history: history.reverse().slice(0, 12)
  };
}

function buildCoreSnapshot(draws) {
  const sortedDraws = [...draws].sort((a, b) => b.round - a.round);
  const cacheKey = `${sortedDraws[0]?.round || 0}:${sortedDraws.length}`;

  if (snapshotCache.coreKey === cacheKey && snapshotCache.coreValue) {
    return snapshotCache.coreValue;
  }

  const value = {
    analysis: buildAnalysis(sortedDraws),
    nextNumberRanking: buildNextNumberRanking(sortedDraws)
  };

  snapshotCache.coreKey = cacheKey;
  snapshotCache.coreValue = value;
  return value;
}

function buildBacktestSnapshot(draws) {
  const sortedDraws = [...draws].sort((a, b) => b.round - a.round);
  const cacheKey = `${sortedDraws[0]?.round || 0}:${sortedDraws.length}`;

  if (snapshotCache.backtestKey === cacheKey && snapshotCache.backtestValue) {
    return snapshotCache.backtestValue;
  }

  const value = runBacktest(sortedDraws, BACKTEST_ROUNDS);
  snapshotCache.backtestKey = cacheKey;
  snapshotCache.backtestValue = value;
  return value;
}

function buildCorePayload(draws) {
  const snapshot = buildCoreSnapshot(draws);
  const recommendationContext = buildRecommendationContext(draws);
  const recommendations = buildRecommendations(draws, RECOMMENDATION_COUNT, {
    context: recommendationContext
  });
  const targetRange = buildTargetRange(recommendations);
  const customRecommendation = buildCustomRecommendation(draws, targetRange.defaultHit3Rate, null, null, recommendationContext);

  return {
    analysis: snapshot.analysis,
    nextNumberRanking: snapshot.nextNumberRanking,
    recommendations,
    customRecommendation,
    targetRange
  };
}

function getLatestDrawMeta(draws) {
  return {
    latestRound: draws[0]?.round || null,
    latestDrawDate: draws[0]?.drawDate || null
  };
}

function isCacheFresh(generatedAt) {
  const date = generatedAt ? new Date(generatedAt) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return false;
  }

  return Date.now() - date.getTime() < CORE_RECALC_INTERVAL_MS;
}

function getCalculationStatus(draws, cache = readAppCache()) {
  const { latestRound } = getLatestDrawMeta(draws);
  const core = cache.core;
  const backtest = cache.backtest;

  return {
    coreReady: Boolean(core?.payload),
    coreFresh: Boolean(core?.payload) && core.sourceRound === latestRound && isCacheFresh(core.generatedAt),
    coreNeedsRefresh: !core?.payload || core.sourceRound !== latestRound || !isCacheFresh(core.generatedAt),
    coreGeneratedAt: core?.generatedAt || null,
    backtestReady: Boolean(backtest?.payload),
    backtestFresh: Boolean(backtest?.payload) && backtest.sourceRound === latestRound && isCacheFresh(backtest.generatedAt),
    backtestNeedsRefresh: !backtest?.payload || backtest.sourceRound !== latestRound || !isCacheFresh(backtest.generatedAt),
    backtestGeneratedAt: backtest?.generatedAt || null
  };
}

function getCorePayloadFromCache(draws) {
  const cache = readAppCache();
  const status = getCalculationStatus(draws, cache);

  if (status.coreFresh && cache.core?.payload) {
    return cache.core.payload;
  }

  return null;
}

function storeCorePayload(draws, payload) {
  const cache = readAppCache();
  const { latestRound } = getLatestDrawMeta(draws);
  cache.core = {
    sourceRound: latestRound,
    generatedAt: new Date().toISOString(),
    payload
  };
  writeAppCache(cache);
}

function storeBacktestPayload(draws, payload) {
  const cache = readAppCache();
  const { latestRound } = getLatestDrawMeta(draws);
  cache.backtest = {
    sourceRound: latestRound,
    generatedAt: new Date().toISOString(),
    payload
  };
  writeAppCache(cache);
}

function invalidateCalculationCache() {
  const cache = readAppCache();
  cache.core = null;
  cache.backtest = null;
  writeAppCache(cache);
}

function sendAppState(res) {
  const draws = readDraws().sort((a, b) => b.round - a.round);
  const cachedCore = getCorePayloadFromCache(draws);
  const corePayload = cachedCore || buildCorePayload(draws);
  if (!cachedCore) {
    storeCorePayload(draws, corePayload);
  }
  const syncState = readSyncState();
  const calcStatus = getCalculationStatus(draws);
  const latestMeta = getLatestDrawMeta(draws);
  const appCache = readAppCache();

  res.json({
    draws,
    analysis: corePayload.analysis,
    nextNumberRanking: corePayload.nextNumberRanking,
    recommendations: corePayload.recommendations,
    customRecommendation: corePayload.customRecommendation,
    targetRange: corePayload.targetRange,
    backtest: appCache.backtest?.payload || null,
    sync: syncState,
    calcStatus,
    latestMeta,
    limits: {
      min: LOTTO_MIN,
      max: LOTTO_MAX,
      picks: PICKS_PER_DRAW
    }
  });
}

async function getAvailableDraws(forceSync = false) {
  if (!forceSync) {
    return readDraws().sort((a, b) => b.round - a.round);
  }

  try {
    const result = await syncLatestDraws(forceSync);
    return result.draws.sort((a, b) => b.round - a.round);
  } catch (error) {
    const draws = readDraws().sort((a, b) => b.round - a.round);
    if (draws.length) {
      console.warn(`Lotto sync fallback: ${error.message}`);
      return draws;
    }
    throw error;
  }
}

async function refreshDrawsInBackground(force = false) {
  try {
    await syncLatestDraws(force);
  } catch (error) {
    console.warn(`Background lotto sync skipped: ${error.message}`);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/lotto", async (_req, res) => {
  try {
    const draws = await getAvailableDraws(false);
    const snapshot = buildCoreSnapshot(draws);
    const recommendations = buildRecommendations(draws, RECOMMENDATION_COUNT);
    const targetRange = buildTargetRange(recommendations);
    const customRecommendation = buildCustomRecommendation(draws, targetRange.defaultHit3Rate);
    const syncState = readSyncState();

    res.json({
      draws,
      analysis: snapshot.analysis,
      nextNumberRanking: snapshot.nextNumberRanking,
      recommendations,
      customRecommendation,
      targetRange,
      sync: syncState,
      limits: {
        min: LOTTO_MIN,
        max: LOTTO_MAX,
        picks: PICKS_PER_DRAW
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "로또 데이터를 불러오지 못했습니다." });
  }
});

app.post("/api/lotto/draws", (req, res) => {
  const result = validateDrawInput(req.body);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const draws = readDraws();
  if (draws.some((draw) => draw.round === result.value.round)) {
    res.status(400).json({ error: "같은 회차가 이미 저장되어 있습니다." });
    return;
  }

  draws.push(result.value);
  writeDraws(draws.sort((a, b) => a.round - b.round));
  invalidateCalculationCache();
  snapshotCache.coreKey = null;
  snapshotCache.coreValue = null;
  snapshotCache.backtestKey = null;
  snapshotCache.backtestValue = null;
  sendAppState(res);
});

app.delete("/api/lotto/draws/:round", (req, res) => {
  const round = Number(req.params.round);
  const draws = readDraws();
  const nextDraws = draws.filter((draw) => draw.round !== round);

  if (nextDraws.length === draws.length) {
    res.status(404).json({ error: "삭제할 회차를 찾지 못했습니다." });
    return;
  }

  writeDraws(nextDraws.sort((a, b) => a.round - b.round));
  invalidateCalculationCache();
  snapshotCache.coreKey = null;
  snapshotCache.coreValue = null;
  snapshotCache.backtestKey = null;
  snapshotCache.backtestValue = null;
  sendAppState(res);
});

app.post("/api/lotto/recommendations", async (_req, res) => {
  try {
    const draws = await getAvailableDraws(false);
    const payload = buildCorePayload(draws);
    storeCorePayload(draws, payload);
    res.json({
      recommendations: payload.recommendations,
      targetRange: payload.targetRange,
      customRecommendation: payload.customRecommendation,
      calcStatus: getCalculationStatus(draws)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "추천 조합을 만들지 못했습니다." });
  }
});

app.post("/api/lotto/custom-recommendation", async (req, res) => {
  try {
    const draws = await getAvailableDraws(false);
    const customRecommendation = buildCustomRecommendation(
      draws,
      req.body?.targetHit3Rate,
      req.body?.fixedNumber,
      req.body?.excludedNumber
    );

    if (!customRecommendation) {
      res.status(400).json({ error: "목표 5등권 확률 값을 확인해 주세요." });
      return;
    }

    if (customRecommendation.error) {
      res.status(400).json({ error: customRecommendation.error });
      return;
    }

    res.json({ customRecommendation });
  } catch (error) {
    res.status(500).json({ error: error.message || "맞춤 조합을 만들지 못했습니다." });
  }
});

app.get("/api/lotto/backtest", async (_req, res) => {
  try {
    const draws = await getAvailableDraws(false);
    const cache = readAppCache();
    res.json({
      backtest: cache.backtest?.payload || null,
      calcStatus: getCalculationStatus(draws, cache)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "백테스트를 수행하지 못했습니다." });
  }
});

app.post("/api/lotto/backtest", async (_req, res) => {
  try {
    const draws = await getAvailableDraws(false);
    const payload = buildBacktestSnapshot(draws);
    storeBacktestPayload(draws, payload);
    res.json({
      backtest: payload,
      calcStatus: getCalculationStatus(draws)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "남은 계산을 마무리하지 못했습니다." });
  }
});

app.post("/api/lotto/sync", async (_req, res) => {
  try {
    const draws = await getAvailableDraws(true);
    const syncState = readSyncState();
    res.json({
      sync: syncState,
      latestMeta: getLatestDrawMeta(draws),
      calcStatus: getCalculationStatus(draws),
      updated: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "최신 데이터를 동기화하지 못했습니다." });
  }
});

app.get("/health", (_req, res) => {
  ensureStorage();
  res.json({ ok: true });
});

app.listen(port, "0.0.0.0", () => {
  ensureStorage();
  console.log(`Lotto analyzer listening on http://0.0.0.0:${port}`);
  setTimeout(() => {
    refreshDrawsInBackground(false);
  }, 3000);
  setInterval(() => {
    refreshDrawsInBackground(false);
  }, SYNC_INTERVAL_MS);
});
