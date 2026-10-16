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
