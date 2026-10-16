# Belote engine

A pure, synchronous, deterministic belote engine. No I/O, no React, no globals —
it takes a game state and an action and returns the next state (or an error
reason). Transport (the poll endpoint / server actions) sits on top of it.

## Scope

**v1 — playable core**

- 32-card deck, 4 players in two fixed partnerships (2v2), partners opposite.
- Split deal: 3 cards each → 2 cards each → bidding → 3 cards each → play.
- Coinche-style climbing auction by **contract type** (clubs → diamonds →
  hearts → spades → no-trump → all-trumps); pass is always allowed; a player may
  bid again after passing.
- Trick play with legal-move enforcement (follow suit; forced trumping).
- Scoring: card values, dix de der, dedans, capot, and the ÷10 rounded running
  game score to 151.

**Deferred (next layers):** declarations (belote/royal, sequences/carrés). The
scoring code is shaped so declarations can be added as another term without
reshaping the core.

## Rules (as agreed)

### Deal & bidding

- Everything runs **counter-clockwise**. Seat order is `0 → 1 → 2 → 3 → 0`.
- Teams: seats **0 & 2** are team `A` (North/South), seats **1 & 3** are team
  `B` (East/West) — partners sit opposite.
- The dealer deals **3 cards** to each player, then **2 cards** to each player
  (**5 each**), dealing to the player after the dealer first.
- **Bidding** opens with the player **after the dealer** and proceeds
  counter-clockwise. Each turn a player may **pass** or name a **strictly
  stronger** contract than the current highest. Strength order:

  | Bid        | Strength |
  | ---------- | -------- |
  | clubs      | 1        |
  | diamonds   | 2        |
  | hearts     | 3        |
  | spades     | 4        |
  | no-trump   | 5        |
  | all-trumps | 6        |

- The auction ends when **three players have passed in a row** after a bid; that
  bidder is the **taker** and their contract sets the mode for the hand.
- If **all four pass** with no bid, the hand is **redealt** (same dealer).
- Once the contract is settled, the dealer deals **3 more cards** to each player
  (**8 each**).
- The player **after the dealer** leads the **first trick**.

### Play

- 8 tricks. The winner of a trick leads the next.
- **Follow suit** if you can (any card of the led suit — no obligation to
  overtake).
- If you **cannot** follow suit:
  - in a **suit contract**: if your **partner is currently master** (holds the
    highest card in the trick) you may play anything; otherwise you **must play a
    trump**, and must **over-trump** if you can (if you cannot over-trump you may
    play any trump; with no trump you discard anything);
  - in **no-trump**: play anything (there is no trump);
  - in **all-trumps**: every card is trump, so with your partner master you play
    anything, otherwise you must **go up**: play a card ranked above the best
    card already on the table if you hold one (otherwise play anything). All four
    suits share the trump ranking, so the whole table compares as one list.
- **Trick winner:** highest trump if any trump was played, otherwise the highest
  card of the led suit.
- **Card order** in a trick:
  - trump suit: `J > 9 > A > 10 > K > Q > 8 > 7`
  - plain suit / no-trump: `A > 10 > K > Q > J > 9 > 8 > 7`
  - all-trumps: every suit uses the trump order; the trick is won by the highest
    card of the led suit.

### Scoring (per hand)

- Card values — trump suit: `J 20, 9 14, A 11, 10 10, K 4, Q 3, 8 0, 7 0`; plain
  suit: `A 11, 10 10, K 4, Q 3, J 2, 9 0, 8 0, 7 0`.
- **Dix de der**: +10 to the team winning the last trick.
- Base hand totals: **suit 162 · all-trumps 258 · no-trump 260** (no-trump hand
  points are doubled, dix de der included).
- **Dedans**: if the taker's team finishes **strictly behind** the opponents it is
  "inside" — the **opponents take the whole hand** and the takers score **0**. A
  tie is **not** dedans: both teams keep their own points.
- **Capot**: if one team wins **all 8 tricks**, that team's raw hand is **350**
  (the other scores 0). Capot applies for every contract.
- Convert raw points to game points with **÷10, rounded** (per team).

### Game

- Running game score is the sum of per-hand game points (÷10 units).
- After a **non-capot** hand, if a team has **≥ 151** the game ends and the team
  with the **higher total wins**.
- A **capot hand never ends the game** — play continues to the next non-capot
  hand, which then decides the winner.

## Architecture

Rules are pure functions; flow is a small phase machine; the domain is layered
`Match → Hand → phase`.

```
server/game/
  cards.ts       Suit, Rank, Card, newDeck(), shuffle(rng)        — primitives
  contracts.ts   Contract, bid strength/order, isStronger()       — primitives
  values.ts      card values & trick points per contract          — rules
  rules.ts       legalCards(...), trickWinner(...)                — rules
  scoring.ts     scoreHand(...) → dedans/capot → toGamePoints()   — rules
  rng.ts         seeded RNG (deterministic tests)                 — support
  types.ts       Match, Hand, phase unions, Action, Reason
  bidding.ts     bidding phase: legalBids() + reduce()            — flow
  playing.ts     playing phase: reduce()                          — flow
  engine.ts      createMatch(), applyAction(), legalActions(),
                 publicState() + settle()                          — flow
  index.ts       barrel re-exporting the whole public API
```

### Data model

```ts
type Match = {
  seats: [PlayerId, PlayerId, PlayerId, PlayerId]; // index = seat, CCW
  scores: Record<Team, number>;   // running game score (÷10 units)
  handNumber: number;
  dealer: Seat;                   // rotates CCW after each scored hand
  winner: Team | null;            // null until the game ends
  lastOutcome: HandOutcome | null;
  hand: Hand;                     // always a live hand
};

type Hand =
  | { phase: "bidding"; dealer; turn; hands; rest;
      top: Contract | null; topBidder: Seat | null; passesInARow }
  | { phase: "playing"; dealer; turn; hands; contract; taker;
      trick: Play[]; tricks: Trick[] };
```

Phase reducers are pure and return a new state; `applyAction` never mutates the
match it is given. Illegal states are unrepresentable because each phase carries
only its own data. There is no `scoring` phase — `settle()` scores and advances
synchronously once the 8th trick is resolved.

### Public API

```ts
createMatch(players: [PlayerId, PlayerId, PlayerId, PlayerId], rng, firstDealer?): Match
applyAction(match, action, rng): { match: Match; error?: Reason }
legalActions(match, playerId): Action[]
publicState(match, viewerId): PublicMatch   // hides other players' hands
```

`applyAction` validates the action, dispatches to the current phase reducer, then
runs `settle()` which performs automatic transitions (finish a deal, resolve a
trick, score a hand, rotate the dealer, check the 151 / capot end condition).

## Assumptions (confirm if any change)

1. A player who passed may bid later.
2. When forced to trump — or to go up in all-trumps — beating the best card on
   the table is required when possible.
3. Capot is 350 for **every** contract (not the contract total).
4. No-trump doubling applies to the hand total (dix de der included).
5. The forced obligation applies to **suit** contracts and **all-trumps**;
   no-trump stays free.
6. Within the led suit there is no obligation to overtake.
7. All-pass redeal keeps the same dealer.
8. The taker does not lead trick 1 — the player after the dealer does.

## Testing

- `npm test` — runs the whole suite (`node --test --conditions=react-server`).
- `npm run typecheck` — `tsc --noEmit`.
- A single file: `node --test --conditions=react-server server/game/<file>.test.ts`

The RNG is injected, so all engine tests are deterministic. Rules modules are
tested in isolation; the flow is tested end-to-end by driving `applyAction`
through a full hand and through the capot / 151 end conditions.
