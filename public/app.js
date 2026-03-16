const state = {
  draws: [],
  analysis: null,
  recommendations: [],
  backtest: null,
  nextNumberRanking: [],
  customRecommendation: null,
  targetRange: null,
  calcStatus: null,
  latestMeta: null,
  flow: {
    syncDone: false
  }
};

const summaryCardsEl = document.getElementById("summary-cards");
const quickPicksEl = document.getElementById("quick-picks");
const numberRankingEl = document.getElementById("number-ranking");
const customRecommendationEl = document.getElementById("custom-recommendation");
const analysisCaptionEl = document.getElementById("analysis-caption");
const syncCaptionEl = document.getElementById("sync-caption");
const statusMessageEl = document.getElementById("status-message");
const loadingPanelEl = document.getElementById("loading-panel");
const loadingTitleEl = document.getElementById("loading-title");
const loadingStepEl = document.getElementById("loading-step");
const loadingBarEl = document.getElementById("loading-bar");
const targetCaptionEl = document.getElementById("target-caption");
const targetHelpEl = document.getElementById("target-help");
const targetGenerateButtonEl = document.getElementById("target-generate-button");
const targetHit3RangeEl = document.getElementById("target-hit3-range");
const targetHit3InputEl = document.getElementById("target-hit3-input");
const targetFixedNumberEl = document.getElementById("target-fixed-number");
const targetExcludedNumberEl = document.getElementById("target-excluded-number");
const syncButtonEl = document.getElementById("sync-button");
const refreshButtonEl = document.getElementById("refresh-button");
const latestRoundLabelEl = document.getElementById("latest-round-label");
const latestDateLabelEl = document.getElementById("latest-date-label");
const heroLatestRoundEl = document.getElementById("hero-latest-round");
const heroHit3AverageEl = document.getElementById("hero-hit3-average");
const heroHit3BestEl = document.getElementById("hero-hit3-best");
const flowGuideEl = document.getElementById("flow-guide");
const avgSumEl = document.getElementById("avg-sum");
const avgOddEl = document.getElementById("avg-odd");
const avgAcEl = document.getElementById("avg-ac");
const avgLowEl = document.getElementById("avg-low");
const sectionBarsEl = document.getElementById("section-bars");
const topPairsEl = document.getElementById("top-pairs");
const carryOverEl = document.getElementById("carry-over");
const endDigitBarsEl = document.getElementById("end-digit-bars");
const consecutiveSummaryEl = document.getElementById("consecutive-summary");
const hotNumbersEl = document.getElementById("hot-numbers");
const coldNumbersEl = document.getElementById("cold-numbers");
const frequencyGridEl = document.getElementById("frequency-grid");
const recommendationListEl = document.getElementById("recommendation-list");
const generateButtonEl = document.getElementById("generate-button");
const drawHistoryEl = document.getElementById("draw-history");
const historyCaptionEl = document.getElementById("history-caption");
const backtestCaptionEl = document.getElementById("backtest-caption");
const backtestSummaryEl = document.getElementById("backtest-summary");
const backtestHistoryEl = document.getElementById("backtest-history");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ballClass(number) {
  if (number <= 10) return "yellow";
  if (number <= 20) return "blue";
  if (number <= 30) return "red";
  if (number <= 40) return "gray";
  return "green";
}

function ball(number, tone = "") {
  return `<span class="ball ${ballClass(number)} ${tone}">${number}</span>`;
}

function summaryCard(label, value, meta) {
  return `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function setLoadingState(title, step, progress, mode = "active") {
  loadingTitleEl.textContent = title;
  loadingStepEl.textContent = step;
  loadingBarEl.style.width = `${Math.max(8, Math.min(100, progress))}%`;
  loadingPanelEl.classList.toggle("done", mode === "done");
  loadingPanelEl.classList.toggle("active", mode === "active");
  loadingPanelEl.classList.toggle("error", mode === "error");
}

function beginActionProgress(actionLabel, step) {
  setLoadingState(`${actionLabel} 시작`, step, 8, "active");
}

function advanceActionProgress(actionLabel, step, progress) {
  setLoadingState(actionLabel, step, progress, "active");
}

function completeActionProgress(actionLabel, step) {
  setLoadingState(`${actionLabel} 완료`, step, 100, "done");
}

function formatSyncLabel(sync) {
  if (!sync?.lastSyncedAt) {
    return "아직 동기화 기록이 없습니다.";
  }

  const date = new Date(sync.lastSyncedAt);
  if (Number.isNaN(date.getTime())) {
    return "동기화 시간을 확인할 수 없습니다.";
  }

  return `${date.toLocaleString("ko-KR")} 기준으로 최신 회차를 확인했습니다.`;
}

function renderSyncFacts() {
  const latestRound = state.latestMeta?.latestRound || state.analysis?.latestRound || state.draws[0]?.round || null;
  const latestDrawDate = state.latestMeta?.latestDrawDate || state.analysis?.latestDrawDate || state.draws[0]?.drawDate || null;

  latestRoundLabelEl.textContent = latestRound ? `${latestRound}회` : "-";
  latestDateLabelEl.textContent = latestDrawDate || "-";
}

function renderHeroMetrics() {
  const latestRoundValue = state.latestMeta?.latestRound || state.analysis?.latestRound || state.draws[0]?.round || null;
  const latestRound = latestRoundValue ? `${latestRoundValue}회` : "-";
  const hit3Rates = state.recommendations.map((item) => Number(item.historicalFit?.hit3Rate || 0));
  const averageHit3Rate = hit3Rates.length
    ? `${(hit3Rates.reduce((total, value) => total + value, 0) / hit3Rates.length).toFixed(2)}%`
    : "-";
  const bestHit3Rate = hit3Rates.length
    ? `${Math.max(...hit3Rates).toFixed(2)}%`
    : "-";

  heroLatestRoundEl.textContent = latestRound;
  heroHit3AverageEl.textContent = averageHit3Rate;
  heroHit3BestEl.textContent = bestHit3Rate;
}

function updateCalcButtons() {
  const status = state.calcStatus || {};
  refreshButtonEl.disabled = !state.flow.syncDone;
  refreshButtonEl.textContent = status.coreNeedsRefresh || status.backtestNeedsRefresh ? "2. 분석 시작" : "2. 분석 다시 계산";

  if (!state.flow.syncDone) {
    flowGuideEl.textContent = "1단계로 최신 회차를 먼저 가져오세요. 그다음 분석 시작 버튼이 열립니다.";
    return;
  }

  flowGuideEl.textContent = "최신 회차 반영이 끝났습니다. 이제 2단계 분석 시작으로 추천과 백테스트를 한 번에 갱신하세요.";
}

function temperatureItem(item, type) {
  const note =
    type === "hot"
      ? `${item.count}회 출현`
      : `${item.missCount}회차째 미출현`;

  return `
    <div class="temperature-chip">
      ${ball(item.number, type)}
      <span>${escapeHtml(note)}</span>
    </div>
  `;
}

function frequencyCell(item) {
  return `
    <div class="frequency-cell">
      ${ball(item.number)}
      <strong>${item.count}</strong>
      <span>${item.missCount}회 비움</span>
    </div>
  `;
}

function recommendationCard(item) {
  return `
    <article class="recommendation-card">
      <div class="recommendation-head">
        <div>
          <span class="recommendation-index">SET ${item.id}</span>
          <h3>${escapeHtml(item.label)}</h3>
        </div>
        <div class="recommendation-meta">
          <span>종합 ${item.score}</span>
          <span>모델 ${item.modelChance}%</span>
          <span>합 ${item.sum}</span>
          <span>홀짝 ${item.odd}:${item.even}</span>
          <span>AC ${item.profileDetails.acValue}</span>
        </div>
      </div>
      <div class="ball-row large">
        ${item.numbers.map((number) => ball(number)).join("")}
      </div>
      <div class="score-grid">
        <div class="score-chip">
          <span>최근성</span>
          <strong>${item.breakdown.numberScore}</strong>
        </div>
        <div class="score-chip">
          <span>백테스트</span>
          <strong>${item.breakdown.backtestScore}</strong>
        </div>
        <div class="score-chip">
          <span>조합 패턴</span>
          <strong>${item.breakdown.patternScore}</strong>
        </div>
      </div>
      <div class="score-grid compact">
        <div class="score-chip">
          <span>5등권 추정</span>
          <strong>${item.historicalFit.hit3Rate}%</strong>
        </div>
        <div class="score-chip">
          <span>저구간 수</span>
          <strong>${item.profileDetails.lowCount}</strong>
        </div>
        <div class="score-chip">
          <span>끝수 다양성</span>
          <strong>${item.profileDetails.endDigitVariety}</strong>
        </div>
        <div class="score-chip">
          <span>연번 수</span>
          <strong>${item.profileDetails.consecutivePairs}</strong>
        </div>
      </div>
      <div class="anchor-list">
        ${item.anchors
          .map(
            (anchor) => `
              <div class="anchor-chip">
                ${ball(anchor.number, "hot")}
                <span>최근 ${anchor.recentScore} / 백테스트 ${anchor.backtestHitRate}%</span>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function quickPickCard(item) {
  return `
    <article class="quick-pick-card">
      <div class="draw-meta">
        <div>
          <strong>SET ${item.id}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
        <div class="recommendation-meta">
          <span>모델 ${item.modelChance}%</span>
          <span>5등권 ${item.historicalFit.hit3Rate}%</span>
        </div>
      </div>
      <div class="ball-row">
        ${item.numbers.map((number) => ball(number)).join("")}
      </div>
    </article>
  `;
}

function rankingCard(item) {
  return `
    <article class="ranking-card">
      <span class="rank-badge">#${item.rank}</span>
      ${ball(item.number, item.rank <= 5 ? "hot" : "")}
      <strong>${item.number}</strong>
      <small>모델 ${item.totalScore}</small>
      <small>최근 ${item.recentScore}</small>
    </article>
  `;
}

function customRecommendationCard(item) {
  if (!item) {
    return `<div class="empty-state">아직 맞춤 조합이 없습니다.</div>`;
  }

  return `
    <article class="recommendation-card spotlight">
      <div class="recommendation-head">
        <div>
          <span class="recommendation-index">CUSTOM</span>
          <h3>${escapeHtml(item.label)}</h3>
        </div>
        <div class="recommendation-meta">
          <span>목표 ${item.targetHit3Rate}%</span>
          <span>모델 ${item.modelChance}%</span>
          <span>5등권 ${item.historicalFit.hit3Rate}%</span>
        </div>
      </div>
      <div class="ball-row large">
        ${item.numbers.map((number) => ball(number)).join("")}
      </div>
      <div class="score-grid">
        <div class="score-chip">
          <span>평균 적중 수</span>
          <strong>${item.historicalFit.averageMatches}</strong>
        </div>
        <div class="score-chip">
          <span>고정 번호</span>
          <strong>${item.fixedNumber || "자동"}</strong>
        </div>
        <div class="score-chip">
          <span>제외 번호</span>
          <strong>${item.excludedNumber || "없음"}</strong>
        </div>
        <div class="score-chip">
          <span>4등권 추정</span>
          <strong>${item.historicalFit.hit4Rate}%</strong>
        </div>
      </div>
    </article>
  `;
}

function backtestCard(item) {
  const best = item.matches.reduce((current, candidate) => (candidate.matchCount > current.matchCount ? candidate : current), item.matches[0]);
  return `
    <article class="draw-card">
      <div class="draw-meta">
        <div>
          <strong>${item.round}회차 백테스트</strong>
          <span>${escapeHtml(item.drawDate)} · 최고 ${best.matchCount}개 적중</span>
        </div>
      </div>
      <div class="ball-row">
        ${item.winningNumbers.map((number) => ball(number)).join("")}
      </div>
      <div class="anchor-list">
        ${item.matches
          .map(
            (match) => `
              <div class="anchor-chip">
                <strong>SET ${match.setId}</strong>
                <span>${match.matchCount}개 · ${match.tier}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function drawCard(draw) {
  return `
    <article class="draw-card">
      <div class="draw-meta">
        <div>
          <strong>${draw.round}회차</strong>
          <span>${escapeHtml(draw.drawDate)}</span>
        </div>
        <button type="button" class="ghost danger" data-round="${draw.round}">삭제</button>
      </div>
      <div class="ball-row">
        ${draw.numbers.map((number) => ball(number)).join("")}
        ${draw.bonus ? `<span class="bonus-divider">+</span>${ball(draw.bonus, "bonus")}` : ""}
      </div>
    </article>
  `;
}

function renderSummary() {
  if (!state.analysis) {
    return;
  }

  const analysis = state.analysis;
  summaryCardsEl.innerHTML = [
    summaryCard("저장 회차", `${analysis.drawCount}개`, "누적 분석 기준"),
    summaryCard("최신 회차", analysis.latestRound ? `${analysis.latestRound}회` : "-", analysis.latestDrawDate || "날짜 없음"),
    summaryCard("평균 출현률", `${analysis.averageHitRate}회`, "번호당 평균"),
    summaryCard("추천 세트", `${state.recommendations.length}개`, "즉시 생성 완료")
  ].join("");

  analysisCaptionEl.textContent = analysis.latestRound
    ? `${analysis.latestRound}회차까지 반영된 데이터입니다.`
    : "아직 분석할 회차가 없습니다.";

  avgSumEl.textContent = analysis.patternSummary.averageSum || "-";
  avgOddEl.textContent = analysis.patternSummary.averageOddCount || "-";
  avgAcEl.textContent = analysis.patternSummary.averageAc || "-";
  avgLowEl.textContent = analysis.patternSummary.averageLowCount || "-";
}

function renderSections() {
  if (!state.analysis) {
    return;
  }

  const counts = state.analysis.patternSummary.sectionCounts || [];
  const max = Math.max(...counts, 1);
  const labels = ["1-10", "11-20", "21-30", "31-40", "41-45"];

  sectionBarsEl.innerHTML = counts
    .map((count, index) => {
      const width = `${Math.max(10, Math.round((count / max) * 100))}%`;
      return `
        <div class="section-row">
          <span>${labels[index]}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${width}"></div></div>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
}

function renderInsights() {
  if (!state.analysis) {
    return;
  }

  const topPairs = state.analysis.patternSummary.topPairs || [];
  const carryOverNumbers = state.analysis.patternSummary.carryOverNumbers || [];

  topPairsEl.innerHTML = topPairs.length
    ? topPairs
        .map(
          (item) => `
            <div class="pair-chip">
              <div class="ball-row">
                ${item.pair.map((number) => ball(number)).join("")}
              </div>
              <span>${item.count}회 동반 출현</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-inline">아직 페어 분석 데이터가 부족합니다.</div>`;

  carryOverEl.innerHTML = carryOverNumbers.length
    ? carryOverNumbers.map((number) => ball(number, "hot")).join("")
    : `<div class="empty-inline">직전 회차와 겹친 번호가 없습니다.</div>`;

  const endDigitCounts = state.analysis.patternSummary.endDigitCounts || [];
  const maxDigitCount = Math.max(...endDigitCounts, 1);
  endDigitBarsEl.innerHTML = endDigitCounts
    .map(
      (count, digit) => `
        <div class="mini-row">
          <span>${digit}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(10, Math.round((count / maxDigitCount) * 100))}%"></div></div>
          <strong>${count}</strong>
        </div>
      `
    )
    .join("");

  consecutiveSummaryEl.textContent = `최근 10회 중 ${state.analysis.patternSummary.consecutiveDrawCount}회에서 연번이 등장했습니다.`;
}

function renderTemperature() {
  if (!state.analysis) {
    return;
  }

  hotNumbersEl.innerHTML = state.analysis.hotNumbers.map((item) => temperatureItem(item, "hot")).join("");
  coldNumbersEl.innerHTML = state.analysis.coldNumbers.map((item) => temperatureItem(item, "cold")).join("");
}

function renderFrequencyGrid() {
  if (!state.analysis) {
    return;
  }

  frequencyGridEl.innerHTML = state.analysis.numberStats.map(frequencyCell).join("");
}

function renderRecommendations() {
  recommendationListEl.innerHTML = state.recommendations.map(recommendationCard).join("");
}

function renderQuickPicks() {
  quickPicksEl.innerHTML = state.recommendations.map(quickPickCard).join("");
}

function renderNumberRanking() {
  numberRankingEl.innerHTML = state.nextNumberRanking.slice(0, 18).map(rankingCard).join("");
}

function renderCustomRecommendation() {
  customRecommendationEl.innerHTML = customRecommendationCard(state.customRecommendation);
}

function applyTargetRange() {
  if (!state.targetRange) {
    return;
  }

  const { min, max, step, averageHit3Rate, defaultHit3Rate } = state.targetRange;
  targetHit3RangeEl.min = String(min);
  targetHit3RangeEl.max = String(max);
  targetHit3RangeEl.step = String(step);
  targetHit3InputEl.min = String(min);
  targetHit3InputEl.max = String(max);
  targetHit3InputEl.step = String(step);

  if (!targetHit3RangeEl.value) {
    targetHit3RangeEl.value = String(defaultHit3Rate);
  }
  if (!targetHit3InputEl.value) {
    targetHit3InputEl.value = String(defaultHit3Rate);
  }

  targetCaptionEl.textContent = `허용 범위 ${min}% ~ ${max}% · 현재 추천 평균 5등권 추정치는 ${averageHit3Rate}% 입니다.`;
}

function populateNumberOptions(selectElement, suffix) {
  if (selectElement.options.length > 1) {
    return;
  }

  for (let number = 1; number <= 45; number += 1) {
    const option = document.createElement("option");
    option.value = String(number);
    option.textContent = `${number}번 ${suffix}`;
    selectElement.append(option);
  }
}

function clampTargetValue(value) {
  if (!state.targetRange) {
    return 3.5;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return state.targetRange.defaultHit3Rate;
  }

  return Math.min(state.targetRange.max, Math.max(state.targetRange.min, numeric));
}

function syncTargetInputs(nextValue) {
  const clamped = clampTargetValue(nextValue);
  const normalized = clamped.toFixed(1);
  targetHit3RangeEl.value = normalized;
  targetHit3InputEl.value = normalized;
  const fixedLabel = targetFixedNumberEl.value ? `${targetFixedNumberEl.value}번 포함` : "포함 번호 없음";
  const excludedLabel = targetExcludedNumberEl.value ? `${targetExcludedNumberEl.value}번 제외` : "제외 번호 없음";
  targetHelpEl.textContent = `현재 목표값 ${normalized}% · ${fixedLabel} · ${excludedLabel} 기준으로 맞춤 1조합을 생성합니다.`;
}

function renderHistory() {
  const visibleDraws = state.draws.slice(0, 24);
  historyCaptionEl.textContent = `전체 ${state.draws.length}개 중 최근 ${visibleDraws.length}개 회차만 표시합니다.`;
  drawHistoryEl.innerHTML = visibleDraws.length
    ? visibleDraws.map(drawCard).join("")
    : `<div class="empty-state">아직 저장된 회차가 없습니다.</div>`;
}

function renderBacktest() {
  if (!state.backtest) {
    return;
  }

  const summary = state.backtest.summary;
  backtestCaptionEl.textContent = `${summary.testedRounds}개 회차를 기준으로, 각 시점의 과거 데이터만 사용해 5세트를 생성한 결과입니다.`;
  backtestSummaryEl.innerHTML = [
    summaryCard("3개 이상", `${summary.hit3Plus}회`, "5등권 이상 경험"),
    summaryCard("4개 이상", `${summary.hit4Plus}회`, "4등권 이상"),
    summaryCard("5개 이상", `${summary.hit5Plus}회`, "3등권 이상"),
    summaryCard("평균 최고 적중", `${summary.averageBestMatch}개`, "회차당 최고치 평균")
  ].join("");

  backtestHistoryEl.innerHTML = state.backtest.history.map(backtestCard).join("");
}

function syncApp(payload) {
  state.draws = payload.draws || [];
  state.analysis = payload.analysis || null;
  state.recommendations = payload.recommendations || [];
  state.nextNumberRanking = payload.nextNumberRanking || [];
  state.customRecommendation = payload.customRecommendation || null;
  state.targetRange = payload.targetRange || null;
  state.calcStatus = payload.calcStatus || null;
  state.latestMeta = payload.latestMeta || null;
  state.backtest = payload.backtest || state.backtest;
  syncCaptionEl.textContent = formatSyncLabel(payload.sync);

  populateNumberOptions(targetFixedNumberEl, "포함");
  populateNumberOptions(targetExcludedNumberEl, "제외");
  renderSyncFacts();
  renderHeroMetrics();
  updateCalcButtons();
  applyTargetRange();
  renderSummary();
  renderCustomRecommendation();
  renderQuickPicks();
  renderNumberRanking();
  renderSections();
  renderInsights();
  renderTemperature();
  renderFrequencyGrid();
  renderRecommendations();
  renderHistory();
}

async function sendJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const raw = await response.text();
  let payload = {};

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        throw new Error("서버가 JSON이 아닌 응답을 반환했습니다.");
      }
      throw new Error("응답을 읽는 중 문제가 발생했습니다.");
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || `요청에 실패했습니다. (${response.status})`);
  }

  return payload;
}

async function waitForHealth(retries = 8, delayMs = 1500) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const payload = await sendJson("/health");
      if (payload?.ok) {
        return true;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt === retries) {
      break;
    }

    const nextDelay = delayMs * (attempt + 1);
    setLoadingState(
      "서버 준비 확인 중",
      `헬스 체크를 확인하는 중입니다. ${Math.round(nextDelay / 1000)}초 후 다시 확인합니다.`,
      12 + ((attempt + 1) / (retries + 1)) * 18,
      "active"
    );
    await wait(nextDelay);
  }

  throw lastError || new Error("서버 준비 상태를 확인하지 못했습니다.");
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function sendJsonWithRetry(url, options = {}, retryOptions = {}) {
  const retries = retryOptions.retries ?? 4;
  const delayMs = retryOptions.delayMs ?? 1500;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sendJson(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      const nextDelay = delayMs * (attempt + 1);
      setLoadingState(
        "서버를 깨우는 중",
        `첫 응답이 느려 재시도합니다. ${Math.round(nextDelay / 1000)}초 후 다시 시도합니다.`,
        18 + ((attempt + 1) / (retries + 1)) * 28,
        "active"
      );
      analysisCaptionEl.textContent = `서버를 깨우는 중입니다... ${attempt + 1}/${retries + 1}`;
      syncCaptionEl.textContent = `첫 응답이 느려 재시도 중입니다... ${Math.round(nextDelay / 1000)}초 후 다시 시도합니다.`;
      await wait(nextDelay);
    }
  }

  throw lastError;
}

async function fetchApp() {
  setLoadingState("서버 상태 확인 중", "Render 인스턴스가 준비됐는지 먼저 확인합니다.", 10, "active");
  await waitForHealth();
  setLoadingState("기본 데이터를 불러오는 중", "저장된 회차와 추천 조합을 준비하고 있습니다.", 28, "active");
  const payload = await sendJsonWithRetry("/api/lotto");
  syncApp(payload);
  setLoadingState("대기 중", "1단계 최신 회차 가져오기를 누르면 새 데이터를 먼저 반영합니다.", 12, "done");
}

async function fetchBacktest() {
  backtestCaptionEl.textContent = "저장된 백테스트를 확인하는 중입니다...";
  const payload = await sendJsonWithRetry("/api/lotto/backtest", {}, { retries: 2, delayMs: 2000 });
  state.backtest = payload.backtest || null;
  state.calcStatus = payload.calcStatus || state.calcStatus;
  updateCalcButtons();
  renderBacktest();

  if (state.backtest) {
    setLoadingState("로딩 완료", "저장된 분석과 백테스트까지 준비되었습니다.", 100, "done");
  } else {
    backtestCaptionEl.textContent = "백테스트가 아직 계산되지 않았습니다. 상단의 '분석 시작'을 눌러 한 번에 계산하세요.";
    backtestHistoryEl.innerHTML = `<div class="empty-state">추천과 백테스트는 분석 시작 버튼에서 순서대로 계산됩니다.</div>`;
    setLoadingState("대기 중", "기본 화면은 준비됐습니다. 1단계부터 순서대로 진행하세요.", 12, "done");
  }
}

async function onTargetGenerateClick() {
  targetGenerateButtonEl.disabled = true;

  try {
    if (
      targetFixedNumberEl.value &&
      targetExcludedNumberEl.value &&
      targetFixedNumberEl.value === targetExcludedNumberEl.value
    ) {
      throw new Error("포함 번호와 제외 번호는 다르게 선택해 주세요.");
    }

    const payload = await sendJson("/api/lotto/custom-recommendation", {
      method: "POST",
      body: JSON.stringify({
        targetHit3Rate: clampTargetValue(targetHit3InputEl.value),
        fixedNumber: targetFixedNumberEl.value ? Number(targetFixedNumberEl.value) : null,
        excludedNumber: targetExcludedNumberEl.value ? Number(targetExcludedNumberEl.value) : null
      })
    });
    state.customRecommendation = payload.customRecommendation || null;
    renderCustomRecommendation();
    const fixedLabel = targetFixedNumberEl.value ? ` · ${targetFixedNumberEl.value}번 포함` : "";
    const excludedLabel = targetExcludedNumberEl.value ? ` · ${targetExcludedNumberEl.value}번 제외` : "";
    targetHelpEl.textContent = `목표 ${targetHit3InputEl.value}%${fixedLabel}${excludedLabel} 기준 맞춤 조합을 생성했습니다.`;
  } catch (error) {
    targetHelpEl.textContent = error.message;
  } finally {
    targetGenerateButtonEl.disabled = false;
  }
}

async function onGenerateClick() {
  generateButtonEl.disabled = true;

  try {
    const payload = await sendJson("/api/lotto/recommendations", {
      method: "POST"
    });
    state.recommendations = payload.recommendations || [];
    state.targetRange = payload.targetRange || state.targetRange;
    state.customRecommendation = payload.customRecommendation || state.customRecommendation;
    state.calcStatus = payload.calcStatus || state.calcStatus;
    updateCalcButtons();
    applyTargetRange();
    renderSummary();
    renderCustomRecommendation();
    renderQuickPicks();
    renderRecommendations();
  } catch (error) {
    statusMessageEl.textContent = error.message;
  } finally {
    generateButtonEl.disabled = false;
  }
}

async function onRefreshClick() {
  refreshButtonEl.disabled = true;
  beginActionProgress("분석 시작", "저장된 회차 기준으로 추천과 백테스트 계산을 시작합니다.");
  statusMessageEl.textContent = "현재 저장된 회차 기준으로 추천과 백테스트를 순서대로 계산하는 중입니다.";

  try {
    advanceActionProgress("분석 시작", "추천 조합과 번호 순위를 계산하고 있습니다.", 44);
    const recommendationsPayload = await sendJson("/api/lotto/recommendations", {
      method: "POST"
    });
    state.recommendations = recommendationsPayload.recommendations || [];
    state.targetRange = recommendationsPayload.targetRange || state.targetRange;
    state.customRecommendation = recommendationsPayload.customRecommendation || state.customRecommendation;
    state.calcStatus = recommendationsPayload.calcStatus || state.calcStatus;
    updateCalcButtons();
    applyTargetRange();
    renderSummary();
    renderCustomRecommendation();
    renderQuickPicks();
    renderRecommendations();

    advanceActionProgress("분석 시작", "추천 계산이 끝났습니다. 백테스트를 이어서 계산합니다.", 74);
    const backtestPayload = await sendJson("/api/lotto/backtest", {
      method: "POST"
    });
    state.backtest = backtestPayload.backtest || null;
    state.calcStatus = backtestPayload.calcStatus || state.calcStatus;
    updateCalcButtons();
    renderBacktest();
    completeActionProgress("분석 시작", "추천과 백테스트를 포함한 분석이 모두 끝났습니다.");
    statusMessageEl.textContent = "추천과 백테스트 계산을 모두 완료했습니다.";
  } catch (error) {
    setLoadingState("분석 실패", error.message, 100, "error");
    statusMessageEl.textContent = error.message;
  } finally {
    refreshButtonEl.disabled = false;
  }
}

async function onSyncClick() {
  syncButtonEl.disabled = true;
  beginActionProgress("최신 회차 가져오기", "공식 회차 데이터 확인을 시작합니다.");
  syncCaptionEl.textContent = "최신 회차를 다시 확인하는 중입니다...";

  try {
    advanceActionProgress("최신 회차 가져오기", "최신 회차와 추첨일을 확인하고 있습니다.", 52);
    const payload = await sendJson("/api/lotto/sync", {
      method: "POST"
    });
    state.calcStatus = payload.calcStatus || state.calcStatus;
    state.latestMeta = payload.latestMeta || state.latestMeta;
    state.flow.syncDone = true;
    renderSyncFacts();
    updateCalcButtons();
    syncCaptionEl.textContent = formatSyncLabel(payload.sync);
    completeActionProgress("최신 회차 가져오기", "새 회차 확인이 끝났습니다. 이제 2단계 분석 시작을 진행하세요.");
    statusMessageEl.textContent = "최신 회차 동기화를 완료했습니다.";
  } catch (error) {
    setLoadingState("동기화 실패", error.message, 100, "error");
    syncCaptionEl.textContent = error.message;
  } finally {
    syncButtonEl.disabled = false;
  }
}

async function onHistoryClick(event) {
  const button = event.target.closest("button[data-round]");
  if (!button) {
    return;
  }

  try {
    const payload = await sendJson(`/api/lotto/draws/${button.dataset.round}`, {
      method: "DELETE"
    });
    syncApp(payload);
    statusMessageEl.textContent = "회차를 삭제했습니다.";
  } catch (error) {
    statusMessageEl.textContent = error.message;
  }
}

generateButtonEl.addEventListener("click", onGenerateClick);
targetGenerateButtonEl.addEventListener("click", onTargetGenerateClick);
syncButtonEl.addEventListener("click", onSyncClick);
refreshButtonEl.addEventListener("click", onRefreshClick);
drawHistoryEl.addEventListener("click", onHistoryClick);
targetHit3RangeEl.addEventListener("input", (event) => {
  syncTargetInputs(event.target.value);
});
targetHit3InputEl.addEventListener("input", (event) => {
  syncTargetInputs(event.target.value);
});
targetFixedNumberEl.addEventListener("change", () => {
  syncTargetInputs(targetHit3InputEl.value);
});
targetExcludedNumberEl.addEventListener("change", () => {
  syncTargetInputs(targetHit3InputEl.value);
});

fetchApp().catch((error) => {
  setLoadingState("불러오기 실패", error.message, 100, "error");
  analysisCaptionEl.textContent = error.message;
  syncCaptionEl.textContent = error.message;
  drawHistoryEl.innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.</div>`;
});

fetchBacktest().catch((error) => {
  setLoadingState("부분 로딩 완료", "기본 화면은 준비됐지만 백테스트는 불러오지 못했습니다.", 88, "done");
  backtestCaptionEl.textContent = error.message;
  backtestHistoryEl.innerHTML = `<div class="empty-state">백테스트를 불러오지 못했습니다.</div>`;
});
