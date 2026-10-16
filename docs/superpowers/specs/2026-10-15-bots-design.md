# Belote — Bots (fill a seat, auto-play) — Design

Date: 2026-10-15
Status: approved for implementation planning
Depends on: `server/game/` engine (complete), `server/rooms/` (the live-game
feature — complete: SSE transport, tailored `RoomView`, room manager, actions).

## 1. Context

The live game is done: four players in a room pick teams, the host presses
**Start**, and the engine drives a full hand pushed over SSE. Every seat is a
human identified by an httpOnly cookie; a room with fewer than four players
cannot start (`startGame` returns `need_four`).

That means a host who is waiting for friends has no way to play. This design
lets the host **add bots** to fill the empty seats while waiting, then start a
normal game in which the bots play their own turns automatically.

Two bot behaviours are requested:

- a **simple heuristic** bot (reasonable, watchable play), and
- a **random** bot (uniformly picks a legal move) — useful as a baseline and as
  a fallback.

The host flow uses the heuristic bot (see §3). Both modules are implemented
because they are independent, testable, and the random one is the natural
fallback/test double.

## 2. Goal

A host alone in a room presses **Add bot** up to three times, presses **Start**,
and plays a full hand against bots that bid and play on their own. Bots appear
in the roster like any other player (badged), never go "away", and never become
host. Everything else — turn order, rules, scoring, hidden hands, SSE — is
unchanged.

### Success criteria

- The host can add up to three bots while waiting; each takes the next empty
  seat and is auto-assigned to the emptier team.
- With humans + bots filling all four seats and all teams set, **Start works
  exactly as it does with four humans**.
- Once started, each bot takes its own turn (bid/pass/play) on a visible beat,
  with no human interaction.
- The game keeps running while every tab is closed — the server drives it.
- Bots are shown as connected players with a `bot` badge and cannot be mistaken
  for the host; a human cannot be seated in a bot's place.
- Engine, transport, routes, and existing tests are unaffected.

### Non-goals (this iteration)

- Choosing bot difficulty or removing a bot from the lobby (host flow is
  heuristic-only, no remove).
- A human taking over a bot, or a bot rejoining a room after a restart.
- Bot chat, personalities, names beyond `Bot 1..3`, or speed controls.
- Persistence — in-memory only, as today.
- Declarations, Contre/Surcontre (unchanged engine gaps).

## 3. Bot modules (pure)

Both modules are **pure** — no I/O, no timers, no room access. They consume the
engine's per-viewer state and return an engine `Action` (or `null`).

```ts
// server/randomBot.ts
import type { Action, PublicMatch, Rng } from "./game/index.ts";

export function chooseAction(view: PublicMatch, rng: Rng = Math.random): Action | null;
```

Returns a uniform pick from `view.legal`; `null` when `view.legal` is empty
(not the bot's turn, game over, or spectator). The index is clamped
(`Math.min(len - 1, Math.floor(rng() * len))`) so a custom `rng` that returns
exactly `1` cannot overflow.

```ts
// server/bot.ts
import type { Action, PublicMatch } from "./game/index.ts";

export function chooseAction(view: PublicMatch): Action | null;
```

A deterministic heuristic. It only ever returns an action drawn from
`view.legal`, so it can never propose an illegal move. Two scoring helpers keep
the rules concrete:

- `suitScore(hand, suit) = Σ cardValue(card, { kind: "suit", suit })` over the
  bot's cards — treating `suit` as trump, so the J/9 of that suit dominate.
- `lowest(cards, contract)` = the card with the smallest
  `trickOrder(card, contract)` (ties broken by `cardValue`).

Rules:

- **Bidding** (`view.hand.phase === "bidding"`): consider the `bid` actions in
  `view.legal` (already the set strictly stronger than the current top). Score
  each candidate by `suitScore(ownHand, candidate.suit)` and bid the
  highest-scoring one **iff** its score ≥ `BID_MIN_SCORE = 40`. Otherwise
  **pass**. Never bids no-trump or all-trumps. Passing is always legal during
  bidding, so a pass is always available.
- **Playing**, choosing only among the `play` actions in `view.legal`:
  - leading (empty `view.hand.trick`): the plain (non-trump) Ace if held, else
    `lowest(plainCards)`, else `lowest(trumps)` — i.e. `lowest` of the whole
    legal set when the hand is all trump;
  - following and the bot's **partner currently wins** the trick
    (`trickWinner(view.hand.trick, contract) === partnerSeat(you)`): play the
    legal card with the smallest `cardValue` (discard, don't spend);
  - following and an **opponent currently wins**, and some legal card would make
    the bot `trickWinner` of `[...trick, { seat: you, card }]`: play the cheapest
    such card by `trickOrder`;
  - otherwise: play the legal card with the smallest `cardValue`.

Both modules import engine **values** via relative paths with an explicit `.ts`
extension (`./game/index.ts`) — the project-wide rule for modules run under
`node --test`. They use only the public engine surface (`PublicMatch`,
`Action`, `Contract`, `Rng`, `cardValue`, `trickOrder`, `trickWinner`,
`partnerSeat`, `SUITS`, `RANKS`).

Using `PublicMatch` (not `Match`) is deliberate: the bot sees exactly what a
seated human sees — its own hand, the public trick, the contract, and its legal
moves. No cheating.

## 4. Bots as players (room model)

A bot is an ordinary rostered `Player` with a `bot` flag. No new room concept is
introduced and no engine change is needed — bot ids simply appear in
`match.seats` the way human ids do.

```ts
// server/definitions.ts
export type Player = {
  id: string;
  name: string;
  host: boolean;
  team?: Team;
  lastSeen?: number;
  /** A server-controlled player with no connection. */
  bot?: boolean;
};
```

New room functions (in `server/rooms/bots.ts`, re-exported from
`server/Rooms.ts`):

```ts
export type AddBotResult =
  | { ok: true; player: Player }
  | { ok: false; reason: "not_host" | "full" | "started" };

export function isBot(room: Room, playerId: string): boolean;
export function addBot(room: Room, actorId: string): AddBotResult;
```

`addBot` (mirrors `startGame(room, actorId)`):

- returns `not_host` unless `actorId` is the room's host;
- refuses when the room is `playing` (`started`);
- refuses when the room is already full — `players.length >= MAX_PLAYERS`
  (`full`);
- computes the bot index `n` as the smallest positive integer for which
  `bot:<code>:<n>` is not already a player id in the room (unique and stable;
  with no bot removal this is `1 + current bot count` — the phrasing only guards
  against a future remove);
- creates `{ id: "bot:<code>:<n>", name: "Bot <n>", host: false, team, bot:
  true }` where `team` is the **emptier** team at add time (ties → `"A"`),
  keeping the teams balanced and never exceeding `MAX_PLAYERS_PER_TEAM`
  (guaranteed by the four-seat cap);
- pushes it onto `room.game.players` and returns it.

Bots carry **no** `lastSeen` and are exempt from every presence rule:

- `sweepStalePlayers` never removes a bot (filter keeps `player.bot`);
- `buildRoomView` reports `bot.connected === true` unconditionally;
- `ensureHost` (and therefore `leaveRoom`, `sweepStalePlayers`) must **never**
  promote a bot to host.

`RoomView`'s `RoomPlayer` gains `bot: boolean` so the client can badge a bot;
the client's `LobbyPlayer` gains the same field. Everything else about the view
is unchanged.

No change is required to `seatPlayers`, `startGame`, `chooseTeam`, or
`applyGameAction`: a fully-staffed room of humans + bots satisfies
`startGame`'s existing checks (`length === 4`, every player has a `team`), and
`seatPlayers` orders bots within their team exactly like humans.

## 5. The turn driver

`server/rooms/botDriver.ts`.

```ts
/** Advances at most one bot action for the room. Returns whether it acted. */
export function pumpRoom(room: Room): boolean;

/** Registers the process-wide ticker once (idempotent). */
export function ensureBotDriver(): void;
```

`pumpRoom(room)`:

1. if `room.match` is null, or `match.winner` is set → return `false`;
2. `const seat = room.match.hand.turn; const playerId = room.match.seats[seat];`
3. if `!isBot(room, playerId)` → return `false` (a human's turn; nothing to do);
4. `const action = chooseAction(publicState(room.match, playerId))` (heuristic);
   if `null` → return `false`;
5. `applyGameAction(room, action)`; on success `broadcast(room)`; return `true`.

`ensureBotDriver()` starts **one** `setInterval` for the whole process
(`TICK_MS = 700`), guarded on `globalThis` so HMR/repeat calls cannot register a
second timer. Each tick iterates `fetchRooms()` and calls `pumpRoom` on each —
so one tick advances at most one action per room, giving every bot move a
visible beat. It is invoked from the server actions that can begin or continue a
bot game (`addBotAction`, `startGameAction`); because it lives in the Node
process it keeps running with every browser closed, satisfying "the game keeps
running".

The driver always uses the heuristic `server/bot.ts`. `server/randomBot.ts` is
implemented and exported (a requested deliverable and a useful baseline/test
double) but is **not** wired into any UI in this iteration.

Stacking guarantee: `pumpRoom` re-reads `room.match` on every call and only acts
for the seat currently on turn, so a tick that races a human action is a no-op
or a legal bot move — never a double move.

## 6. Server action and lobby UI

`server/actions.ts` gains:

```ts
export type AddBotState = { error: string } | null;

export async function addBotAction(
  _prev: AddBotState,
  formData: FormData,
): Promise<AddBotState>;
```

It resolves the room from `code`, resolves `playerId` from the cookie, calls
`addBot(room, playerId)` (which enforces the host check), calls
`ensureBotDriver()`, then `broadcast(room)`. On failure it maps the reasons to
messages: `Room not found`, `Only the host can add bots` (`not_host`),
`Room is full` (`full`), `The game has already started` (`started`).

`components/RoomLobby.tsx`:

- while waiting (`amHost && !playing && players.length < SEAT_COUNT`) render an
  **Add bot** button beside **Start game**, disabled while a transition is
  pending, showing an error line on failure;
- a bot's `SeatCard` shows a `bot` badge instead of the `(you)`/"waiting" copy
  and displays its auto-assigned team;
- the status copy under the button accounts for bots (e.g. still reports how
  many seats are left).

No change to `GameTable`: it renders whatever the stream pushes, and bot seats
already appear there via `players` + `match.seats`.

## 7. Files

**New**

- `server/randomBot.ts` (+ `server/randomBot.test.ts`) — uniform legal move.
- `server/bot.ts` (+ `server/bot.test.ts`) — heuristic move.
- `server/rooms/bots.ts` (+ `server/rooms/bots.test.ts`) — `Player.bot`,
  `addBot`, `isBot`.
- `server/rooms/botDriver.ts` (+ `server/rooms/botDriver.test.ts`) —
  `pumpRoom`, `ensureBotDriver`.

**Changed**

- `server/definitions.ts` — `Player.bot?`.
- `server/Rooms.ts` — re-export bot helpers; exempt bots in
  `sweepStalePlayers`; `ensureHost` skips bots.
- `server/rooms/view.ts` — `RoomPlayer.bot`; bots always `connected`.
- `server/actions.ts` — `addBotAction`; call `ensureBotDriver()` in
  `startGameAction`.
- `components/lobby.ts` — `LobbyPlayer.bot`.
- `components/RoomLobby.tsx` — Add-bot button + bot badge.

## 8. Testing and verification

TDD throughout, in the existing Node test style
(`node --test --conditions=react-server`). After every task: `npm test` and
`npm run typecheck` must pass; run `npm run build` before the browser check.

- **`randomBot.test.ts`** — returns a member of `view.legal`; `null` when
  `legal` is empty; a seeded `Rng` gives a deterministic pick; works in both
  bidding and playing phases.
- **`bot.test.ts`** — `null` off-turn; bids a legal, strictly-stronger contract
  on a strong hand and passes on a weak one; leads a plain Ace when held; follows
  suit; discards lowest when the partner is winning; beats cheaply when an
  opponent is winning; every returned action is inside `view.legal` (also
  assert the engine accepts it via `applyAction`).
- **`bots.test.ts`** — `addBot` refuses a non-host actor (`not_host`), mints
  unique bot ids, balances teams, refuses at four players (`full`) and once
  playing (`started`), never sets `host`; `sweepStalePlayers` keeps bots and
  never promotes one to host; `seatPlayers` includes bots in the right seats;
  `buildRoomView` marks bots connected and badges them.
- **`botDriver.test.ts`** — `pumpRoom` acts exactly once on a bot's turn and
  changes the match, does nothing on a human's turn, on a finished match, or
  when `match` is null; `ensureBotDriver` is idempotent (call twice, still one
  timer — asserted by a registration flag, not by sleeping).
- **End-to-end oracle (headless):** a room of one host + three bots →
  `startGame(room, host)` → loop `pumpRoom(room)` (bounded, e.g. ≤ 2000
  iterations) until `match.winner` is set, asserting every applied action is the
  engine's legal choice and no `applyGameAction` returns an error along the way.
- **Browser verification (required):** host adds three bots, starts; confirm the
  table plays itself to a score/finish with watchable pacing, bots are badged,
  and no input is required from the human; confirm the game also advances while
  the human's tab is closed.

## 9. Risks and mitigations

- **A leaked or duplicated interval.** Mitigated by the `globalThis` guard in
  `ensureBotDriver` and by the pure `pumpRoom` being the only thing the tick
  does (unit-testable without timers).
- **Bots occupy human seats.** Intended: once three bots fill a room, a fifth
  human cannot join; the host chose to fill it. Documented, not solved.
- **All humans leave pre-start, leaving only bots.** The room stalls with no
  host (no one can start). Accepted for this iteration; noted, not solved.
- **Pacing under load.** One global 700 ms tick advancing one action per room;
  trivial at this scale. If a room ever needed faster play, `TICK_MS` is a
  single constant.
- **Determinism.** The heuristic bot is deterministic; the random bot takes an
  injectable `Rng`, so both are replayable in tests.
