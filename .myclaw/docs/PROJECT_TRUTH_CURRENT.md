# PROJECT_TRUTH_CURRENT

Updated: 2026-04-03

## 1. What This Nest Represents

- A project-local `myclaw` operations home for `lotto` that keeps current truth, state, and generated evidence under one nested folder instead of scattering ops files across the project root.
- The project itself is a Node.js + Express lotto analysis generator that reads official draw history, scores numbers, generates 5 recommendations, a custom 1 pick, and a backtest snapshot.

## 2. Main Paths

1. project root:
   - `C:\Users\KGWPC\workspace\lotto`
2. project-local nest root:
   - `C:\Users\KGWPC\workspace\lotto\.myclaw`
3. main server entry:
   - `C:\Users\KGWPC\workspace\lotto\server.js`
4. browser entry:
   - `C:\Users\KGWPC\workspace\lotto\public\app.js`
5. local draw history:
   - `C:\Users\KGWPC\workspace\lotto\data\lotto-draws.json`
6. local sync state:
   - `C:\Users\KGWPC\workspace\lotto\data\lotto-sync-state.json`
7. local app cache:
   - `C:\Users\KGWPC\workspace\lotto\data\lotto-app-cache.json`
8. local docs root:
   - `C:\Users\KGWPC\workspace\lotto\.myclaw\docs`
9. local state root:
   - `C:\Users\KGWPC\workspace\lotto\.myclaw\state`
10. shared engine root:
   - `C:\Users\KGWPC\workspace\myclaw`

## 3. Current Truth

1. `server.js` should reuse a shared core context for recommendation, ranking, and backtest-driven scoring instead of recomputing the same analysis path for every route.
2. The browser should paint the top-level summary and recommendation panels first, then defer lower-priority history and backtest detail rendering.
3. Lottery selection logic can improve coverage, diversity, and balance, but it cannot change the actual winning odds.
4. `data/lotto-draws.json` and `data/lotto-sync-state.json` are mutable current truth files, while `.myclaw` holds the operational record around them.
5. Project-local ops docs should stay in `.myclaw` unless the project later needs a deliberate repo-root ops surface.

## 4. Practical Rule

1. use this nest as the local operations home first
2. keep the shared engine as a reusable helper source only
3. avoid creating duplicate current docs in both the project root and this nest without a clear ownership split

