### Task 10: Pure table helpers

**Files:**
- Create: `components/table.ts`
- Test: `components/table.test.ts`

**Interfaces:**
- Consumes (types only): `Action`, `Card`, `Contract`, `Seat` from `../server/game/index.ts`.
- Produces:
  - `screenSlot(you: Seat, seat: Seat): "bottom" | "left" | "top" | "right"`.
  - `isPlayable(card: Card, legal: Action[]): boolean`.
  - `contractLabel(contract: Contract | null): string`.
  - `rankLabel(rank: Card["rank"]): string`.
  - `suitSymbol(suit: Card["suit"]): string`.
  - `cardLabel(card: Card): string`.

- [ ] **Step 1: Write the failing tests** — create `components/table.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import type { Action, Card, Seat } from "../server/game/index.ts";
import { cardLabel, contractLabel, isPlayable, screenSlot, suitSymbol } from "./table.ts";

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });

test("screenSlot places you bottom, partner top, opponents on the sides", () => {
  assert.equal(screenSlot(0, 0), "bottom");
  assert.equal(screenSlot(0, 1), "left");
  assert.equal(screenSlot(0, 2), "top");
  assert.equal(screenSlot(0, 3), "right");

  assert.equal(screenSlot(2, 2), "bottom");
  assert.equal(screenSlot(2, 3), "left");
  assert.equal(screenSlot(2, 0), "top");
  assert.equal(screenSlot(2, 1), "right");
});

test("isPlayable is true only for a legal play of the matching card", () => {
  const legal: Action[] = [
    { kind: "play", playerId: "me", card: card("hearts", "A") },
    { kind: "pass", playerId: "me" },
  ];

  assert.equal(isPlayable(card("hearts", "A"), legal), true);
  assert.equal(isPlayable(card("hearts", "K"), legal), false);
  assert.equal(isPlayable(card("hearts", "A"), []), false);
});

test("labels a contract", () => {
  assert.equal(contractLabel({ kind: "suit", suit: "clubs" }), "Clubs");
  assert.equal(contractLabel({ kind: "nt" }), "No-trump");
  assert.equal(contractLabel({ kind: "at" }), "All-trumps");
  assert.equal(contractLabel(null), "—");
});

test("formats a card as rank plus suit symbol", () => {
  assert.equal(suitSymbol("hearts"), "♥");
  assert.equal(cardLabel(card("spades", "10")), "10♠");
  assert.equal(cardLabel(card("diamonds", "A")), "A♦");
});

test("a Seat type is accepted", () => {
  const seat: Seat = 3;
  assert.equal(screenSlot(0, seat), "right");
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `node --test --conditions=react-server components/table.test.ts`
Expected: FAIL — cannot find module `./table.ts`.

- [ ] **Step 3: Create `components/table.ts`**

```ts
import type { Action, Card, Contract, Seat, Suit } from "../server/game/index.ts";

export type ScreenSlot = "bottom" | "left" | "top" | "right";

/** Where a seat sits on the viewer's screen, relative to the viewer's seat. */
const SCREEN_SLOTS = ["bottom", "left", "top", "right"] as const;

export function screenSlot(you: Seat, seat: Seat): ScreenSlot {
  // A literal index stays well-typed even under noUncheckedIndexedAccess.
  const offset = ((seat - you + 4) % 4) as 0 | 1 | 2 | 3;
  return SCREEN_SLOTS[offset];
}

/** True when the card appears among the viewer's legal plays. */
export function isPlayable(card: Card, legal: Action[]): boolean {
  return legal.some(
    (action) =>
      action.kind === "play" &&
      action.card.suit === card.suit &&
      action.card.rank === card.rank,
  );
}

const CONTRACT_LABEL: Record<Suit, string> = {
  clubs: "Clubs",
  diamonds: "Diamonds",
  hearts: "Hearts",
  spades: "Spades",
};

export function contractLabel(contract: Contract | null): string {
  if (!contract) return "—";
  if (contract.kind === "nt") return "No-trump";
  if (contract.kind === "at") return "All-trumps";
  return CONTRACT_LABEL[contract.suit];
}

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

export function rankLabel(rank: Card["rank"]): string {
  return rank;
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}
```

- [ ] **Step 4: Run and pass**

Run: `node --test --conditions=react-server components/table.test.ts` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Checkpoint.**

---

