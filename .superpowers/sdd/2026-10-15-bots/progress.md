# SDD ledger — plan: docs/superpowers/plans/2026-10-15-bots.md

Spec (binding authority): docs/superpowers/specs/2026-10-15-bots-design.md
Workspace: /Users/Rosen/WebstormProjects/belote

## Process adaptations (no git — user declined `git init`)
- Ruling: run in-place, no worktree, no commits. Implementers must NOT run `git`. — because the workspace is not a repo and the user chose "Skip git". — cost if wrong: no history to revert; recovery is re-running tasks.
- Ruling: ledger records file lists, not commit SHAs.
- Ruling: checkpoints are file-state notes instead of commits (`git log` cannot be the record).
- Ruling: the final whole-branch review is done by a fresh subagent against the file list + plan + spec (no diff artifact available); the reviewer reads the changed files directly. — cost if wrong: reviewer may miss incidental changes outside the listed files.

## Global constraints (from the plan)
- Node ESM: any `server/…` module run by `node --test` must import engine VALUES via relative path + explicit `.ts` (e.g. `../game/index.ts`).
- App/route/client may use `@/…`; `server/actions.ts` may use `@/…`.
- Client components import engine TYPES ONLY, never engine values.
- After every task: `npm test` (all) and `npm run typecheck` pass.
- No git. Do not run git commands. Checkpoint instead of commit.
- Do not delete `server/game/**`; do not change engine semantics or transport.

## Pre-flight conflict scan
| Task | Shared artifact | Order / decision |
|------|-----------------|------------------|
| 1 | `server/definitions.ts` (`Player.bot`), `server/Rooms.ts` (re-export) | first; produces `addBot`/`isBot`/`AddBotResult` |
| 2 | `server/Rooms.ts` (`sweepStalePlayers`, `ensureHost`), `server/rooms/view.ts` (`RoomPlayer.bot`) | after 1 (needs `Player.bot`, `addBot`) |
| 3 | `server/randomBot.ts` | pure; independent of 1/2 |
| 4 | `server/bot.ts` | pure; independent of 1/2/3 |
| 5 | `server/rooms/botDriver.ts` | after 1 (`isBot`), 4 (`chooseAction`) |
| 6 | `server/actions.ts` (`addBotAction`, `ensureBotDriver` call) | after 1 (`addBot`), 5 (`ensureBotDriver`) |
| 7 | `components/lobby.ts`, `components/RoomLobby.tsx` | after 2 (`RoomPlayer.bot`), 6 (`addBotAction`) |
| 8 | browser verification | last |

Cross-task type checks: `addBot(room, actorId)` consumed identically in T2/T5/T6; `RoomPlayer.bot` (T2) feeds `LobbyPlayer.bot` (T7) — both required `boolean`, `RoomPlayer` structurally assignable to `LobbyPlayer`; `chooseAction` name reused by T3 (random) and T4 (heuristic) in separate modules, no clash; `ensureBotDriver`/`pumpRoom`/`stopBotDriver`/`botDriverRunning`/`TICK_MS` match between T5 producer and T6 consumer.
Cycle check: `botDriver.ts` → `Rooms.ts` → `rooms/bots.ts`; `Rooms.ts` does NOT import `botDriver.ts`. No cycle.

## Rulings (plan vs spec)
- Task 2: Ruling: pull `LobbyPlayer.bot: boolean` (plan Task 7 Step 1) + the `components/lobby.test.ts` `player()` helper `bot: false` forward into Task 2. — Task 2 adds `RoomPlayer.bot`, but `RoomLobby` passes `LobbyPlayer[]` to `GameTable` (which requires `RoomPlayer[]`); without a required `bot` on `LobbyPlayer`, `npm run typecheck` fails at Task 2, violating the per-task gate. Making it optional would not help (optional `bot` is still not assignable to required `bot`). — cost if wrong: one tiny type-field edit lands a task early.

## Task log
- Task 1: complete (files: server/definitions.ts [Player.bot], server/rooms/bots.ts [new], server/rooms/bots.test.ts [new], server/Rooms.ts [re-export]; tests: `npm test` 171/171 pass, typecheck clean). Checkpoint: bots.test.ts 5/5 watched fail (ERR_MODULE_NOT_FOUND) then pass. Note: prior ledger's "162" baseline was stale — actual pre-existing suite 166; +5 new = 171.
- Task 2: complete (files: server/Rooms.ts [sweepStalePlayers bot exemption, ensureHost first-human], server/rooms/view.ts [RoomPlayer.bot + connected], server/Rooms.test.ts [+2], server/rooms/view.test.ts [+1], components/lobby.ts [LobbyPlayer.bot], components/lobby.test.ts [helper]; tests: `npm test` 174/174 pass, typecheck clean). Checkpoint: 3 new tests watched fail then pass. Ruling applied (LobbyPlayer.bot pulled forward).
- Task 3: complete (files: server/randomBot.ts [new], server/randomBot.test.ts [new]; tests: `npm test` 178/178 pass, typecheck clean). Checkpoint: 4/4 watched fail (module not found) then pass. Ruling: plan's bid contract `{ kind: "spades" }` corrected to `{ kind: "suit", suit: "spades" }` — Contract is a tagged union with suit/nt/at; caught by typecheck, not by `node --test` (type-stripping). — cost if wrong: none.
- ⚠️ CONCURRENT-WORK NOTE (2026-10-15 15:45-15:46): a second agent is editing THIS workspace, on a separate feature — `components/table.ts` + `components/table.test.ts` (card pip layout + hand fan: new `Pip`/`pipLayout`/`fanAngle` exports). Observed its own TDD RED (15:45, `npm test` failed on missing `fanAngle`/`pipLayout`, then on `strictEqual` `-0` vs `0`) then GREEN (15:46). — I did NOT touch those files; they are foreign, in-flight work. Suite size grew 178 → 196 from their tests alone. — risk: our two agents share one directory, so `components/RoomLobby.tsx`/`GameTable.tsx` (which BOTH features touch) may collide; my edits are additive and re-verified each task.
- Task 4: complete (files: server/bot.ts [new], server/bot.test.ts [new]; tests: `npm test` 196/196 pass, typecheck clean). Checkpoint: 9/9 watched fail (module not found) then pass — includes the full-game legality oracle (20000-guard loop, every bot action accepted by `applyAction`).
- Task 5: complete (files: server/rooms/botDriver.ts [new: TICK_MS, pumpRoom, ensureBotDriver, stopBotDriver, botDriverRunning], server/rooms/botDriver.test.ts [new]; tests: `npm test` 202/202 pass, typecheck clean). Checkpoint: 6/6 watched fail (module not found) then pass. Ruling: the plan's headless oracle ("1 host + 3 bots → loop `pumpRoom`") cannot reach a winner as written — `pumpRoom` correctly refuses the human host seat, so the loop stalls at the host's turn. Kept the spec's composition and had the test drive only the host seat with the same heuristic `chooseAction` (no browser), while `pumpRoom` handles every bot turn. — the spec's intent is "a bot-driven table plays a whole game with only legal actions"; driver still proven on all-bot seats by the other tests. — cost if wrong: the oracle also exercises the human-seat path, which is fine.
- ⚠️ COLLISION (2026-10-15 15:51): during a `npm test` run the second agent was mid-write of `server/game/rules.ts` (an ENGINE file), so ~11 files that transitively import the engine failed transiently (`rules.test.ts`, my `botDriver`/`bots`/`randomBot`, `view`, `broadcast`) and the count appeared to drop 196→158; re-run 2s later: 202/202 green. I do not touch `server/game/**`.
- Task 6: complete (files: server/actions.ts [import addBot + ensureBotDriver; new `addBotAction`; `startGameAction` now calls `ensureBotDriver()`]; tests: `npm test` 202/202 pass, typecheck clean, `npm run build` ok). Note: Task 6 has no test of its own — `addBotAction` is a thin server-action wrapper over `addBot` (covered by bots.test.ts) + `ensureBotDriver` (covered by botDriver.test.ts) + `broadcast` (covered by broadcast.test.ts); verified via typecheck+build.
- Task 8: complete (browser verification). Headless Chromium (Playwright) against the dev server on :3000; script `verify_bots.py` (temp dir); screenshots `task8-lobby-with-bots.png`, `task8-bid-dialog.png`, `task8-after-return.png`. **18/18 checks pass**: host-only "Add bot"; 3 bots seat as Bot 1..3 with teams B/A/B; 2/2 balanced; "bot" badges; no bot is host; Add bot hidden at 4; Start enabled only once all four seats have teams; after Start the three bots auto-played to the human's turn in ~2.4s (= 3 x 0.7s pacing); human Pass accepted; then the tab was sent to `about:blank` for 4.5s (~6 ticks) and on return the board had advanced with **no tab open** (server-side driver); table re-rendered; zero uncaught page errors.
  Observation (not a defect): if the host adds bots *before* choosing a team, bots take A,B,A and team A then reads "(full)", so the host must join B. Start still succeeds and teams still end 2/2 — faithful to the spec's "emptier team" rule, just an awkward ordering. No change made.
- **Final fresh-context review** (executing-plans: one review of the whole branch; file-list based per Ruling — no git). Verdict: **Ready to merge — Yes.** 0 Critical, 0 Important, 7 Minor. Dispositions:
  - FIXED — `RoomLobby.addBot()` lacked the plan's guard + `setBotError(null)` (a stale alert could linger after a later success).
  - FIXED — `SeatCard` `(you)` not suppressed for bots (plan Step 3 + spec §6: bot badge *instead of* the `(you)`/"waiting" copy).
  - FIXED — lobby copy ignored bots (spec §6): header → `Waiting for players or bots to join (n/4)`; under-button → `Need 4 seats filled to start (n/4)`.
  - FIXED — `randomBot.test.ts` `sameAction` compared bids only by `contract.kind` (any suit equalled any suit, so the "in the legal set" assertion could pass spuriously; the plan's own helper had this hole). Now compares `suit` for suit contracts — suite stayed green (203), so randomBot's bids were in fact legal.
  - FIXED — `botDriver` interval now `.unref?.()` (typed as an intersection so it typechecks under either DOM or Node `setInterval`), so a bare Node process can't be held open by the ticker; Next's loop keeps it firing, so the "runs with all tabs closed" requirement is unaffected.
  - FIXED — spec §6 messages for `addBotAction` are now pinned: `ADD_BOT_ERRORS` extracted into `server/rooms/bots.ts` as `Record<AddBotReason, string>` (exhaustive — kills the old if-chain's silent "started" default) + a test in `bots.test.ts`; `server/actions.ts` consumes it.
  - DECLINED — an automated test for `startGameAction` → `ensureBotDriver()` wiring: `server/actions.ts` imports `@/…` + `next/*` and is not loadable under `node --test` without restructuring the app layer; the call was verified live in Task 8 (bots auto-played immediately after Start, and that call is the only driver source). Extracting a seam would test the seam, not the wiring.
  - NO ACTION (reviewer's own "Declined to judge", spec-sanctioned): human-seat stall with all tabs closed (spec §5/§9); bots occupying human seats (spec §9); `randomBot` deliberately unwired (spec §5); `botDriver.test.ts` oracle divergence (already ruled in Task 5).
- Gates after the review fixes: `npm test` **203/203** (+1 for `ADD_BOT_ERRORS`), `npm run typecheck` clean, `npm run build` ok, and the live browser suite re-run **18/18**. Plan Tasks 1–8 all complete.
- ⚠️ ENGINE FLAPPING (2026-10-15 15:52-15:53): the other agent's saves caught `server/game/rules.ts` in a transiently broken state mid-write → `npm run build`'s typecheck failed on their file (`legalCards` missing, `partnerIsMaster` undefined) while plain `tsc` (run a second earlier) was clean. Re-read = intact 126 lines; re-ran typecheck+build → both green. I do not touch `server/game/**`.
- Task 7: complete (files: components/RoomLobby.tsx [import `addBotAction`; `botError`/`botPending` state; `addBot()` handler; `botBadge()`; bot badge in `SeatCard`; host-only "Add bot" button while seats remain + `botError` alert]; `components/lobby.ts` `LobbyPlayer.bot` + `components/lobby.test.ts` helper landed earlier in Task 2 per ruling; tests: `npm test` 202/202, typecheck clean, `npm run build` ok). Note: no dedicated component test — lobby helpers are covered by lobby.test.ts; the UI path is verified live in Task 8. (An earlier interrupted `edit` call had not applied; re-applied against the real `startGame` body.)




