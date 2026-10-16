import type { Action, Card, Contract, Seat, Suit } from "../server/game/index.ts";

export type ScreenSlot = "bottom" | "left" | "top" | "right";

/**
 * Where a seat sits on the viewer's screen, relative to the viewer's seat.
 * Play runs counter-clockwise, so the player seated after the viewer (seat + 1)
 * appears on the right: bottom → right → top → left.
 */
const SCREEN_SLOTS = ["bottom", "right", "top", "left"] as const;

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

/** Hearts and diamonds are the red suits. */
export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
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

/** Degrees the fanned hand spans in total before the per-card cap applies. */
const FAN_ARC = 44;
const MIN_SPREAD = 4.5;
const MAX_SPREAD = 8;

/**
 * How far card `index` of `count` tilts when held as a fan, in degrees.
 * The middle card stands flat, the halves mirror exactly, and the spread
 * eases off as the hand grows so eight cards read as a fan, not a semicircle.
 */
export function fanAngle(index: number, count: number): number {
  if (count < 2) return 0;
  const spread = Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, FAN_ARC / (count - 1)));
  return (index - (count - 1) / 2) * spread;
}

/** Pixels the hand bows by, from the level middle out to the dropped edges. */
const FAN_BOW = 30;

/**
 * How far card `index` of `count` drops below the middle of the held fan, in
 * px. The tilt already spreads the cards; this bow drops the outer ones so
 * their tops trace a smooth arc instead of a straight row that only dips at
 * the ends. The middle cards stay level and the halves mirror exactly.
 */
export function fanLift(index: number, count: number): number {
  if (count < 2) return 0;
  const mid = (count - 1) / 2;
  const offset = (index - mid) / mid;
  return FAN_BOW * offset * offset;
}

/** A stable identity for a contract, for comparing engine bids to UI buttons. */
export function contractKey(contract: Contract): string {
  return contract.kind === "suit" ? `suit:${contract.suit}` : contract.kind;
}

const SUIT_DISPLAY_ORDER: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

/** Suits left-to-right for display: trump first, then the rest ascending. */
export function suitOrder(contract: Contract | null): Suit[] {
  const trump = contract && contract.kind === "suit" ? contract.suit : null;
  if (!trump) return SUIT_DISPLAY_ORDER;
  return [trump, ...SUIT_DISPLAY_ORDER.filter((suit) => suit !== trump)];
}

const TRUMP_RANK_DISPLAY: Record<Card["rank"], number> = {
  J: 7,
  "9": 6,
  A: 5,
  "10": 4,
  K: 3,
  Q: 2,
  "8": 1,
  "7": 0,
};

const PLAIN_RANK_DISPLAY: Record<Card["rank"], number> = {
  A: 7,
  "10": 6,
  K: 5,
  Q: 4,
  J: 3,
  "9": 2,
  "8": 1,
  "7": 0,
};

function countsAsTrump(card: Card, contract: Contract | null): boolean {
  if (!contract) return false;
  if (contract.kind === "at") return true;
  if (contract.kind === "nt") return false;
  return card.suit === contract.suit;
}

function displayRank(card: Card, contract: Contract | null): number {
  return countsAsTrump(card, contract)
    ? TRUMP_RANK_DISPLAY[card.rank]
    : PLAIN_RANK_DISPLAY[card.rank];
}

/** A copy of the hand ordered for display: trump first, strongest card first. */
export function sortHand(cards: readonly Card[], contract: Contract | null): Card[] {
  const order = suitOrder(contract);

  return [...cards].sort((a, b) => {
    const bySuit = order.indexOf(a.suit) - order.indexOf(b.suit);
    if (bySuit !== 0) return bySuit;
    return displayRank(b, contract) - displayRank(a, contract);
  });
}
