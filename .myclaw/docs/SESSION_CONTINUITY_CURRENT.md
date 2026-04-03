# SESSION_CONTINUITY_CURRENT

Updated: 2026-04-03

## 1. Current Status

- The project-local `myclaw` nest for `lotto` has been bootstrapped.
- Local current docs now live under `C:\Users\KGWPC\workspace\lotto\.myclaw\docs`.
- Local state placeholders now live under `C:\Users\KGWPC\workspace\lotto\.myclaw\state`.
- The early question window should persist in `C:\Users\KGWPC\workspace\lotto\.myclaw\state\bootstrap_direction_state.json`.
- The shared engine still lives at `C:\Users\KGWPC\workspace\myclaw`.
- The shared engine is not the default project truth root; it should stay a helper/admin surface unless the task explicitly becomes engine maintenance.

## 2. What The Next Session Should Read First

1. `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\START_HERE_CURRENT.md`
2. `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\PROJECT_TRUTH_CURRENT.md`
3. `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\CONTEXT_ENGINEERING_CURRENT.md`
4. `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\SUPPORT_MEANS_POLICY_CURRENT.md`
5. `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\PROJECT_BOOTSTRAP_CURRENT.md`
6. `C:\Users\KGWPC\workspace\lotto\.myclaw\MYCLAW_PROJECT_PROFILE_CURRENT.json`

## 3. What Was Just Changed

1. created a project-local operations nest at `C:\Users\KGWPC\workspace\lotto\.myclaw`
2. created a minimal current-doc pack under `C:\Users\KGWPC\workspace\lotto\.myclaw\docs`
3. created local state placeholders under `C:\Users\KGWPC\workspace\lotto\.myclaw\state`
4. prepared durable local state for the early bootstrap direction window
5. kept reusable engine logic in the shared core instead of copying the whole engine into the project

## 4. Biggest Remaining Uncertainty

1. the local nest is ready for project-local truth and reporting, but advanced loop/session scripts still run from the shared engine today
2. repo-level ops docs may still be optional; apply them only if the project truly needs that wider surface

## 5. Next Best Move

1. start the next project session from `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\START_HERE_CURRENT.md`
2. after bootstrap and default local save are complete, ask the user only the short direction questions listed in `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\BOOTSTRAP_DIRECTION_QUESTIONS_CURRENT.md`
3. record the current question index and accepted support means in `C:\Users\KGWPC\workspace\lotto\.myclaw\state\bootstrap_direction_state.json`
4. use `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\CONTEXT_ENGINEERING_CURRENT.md` to keep context write/select/compress/isolate rules visible in the project
5. use `C:\Users\KGWPC\workspace\lotto\.myclaw\docs\SUPPORT_MEANS_POLICY_CURRENT.md` to keep bracket-tag reporting and early support recommendations visible
6. keep local operations docs inside the nest unless a wider repo-level doc is justified
7. use the shared engine only for reusable helpers or deeper control-plane work
