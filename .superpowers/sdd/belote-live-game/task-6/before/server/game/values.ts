import type { Card, Rank } from "./cards.ts";
import type { Contract } from "./contracts.ts";

const TRUMP_VALUES: Record<Rank, number> = {
  J: 20,
  "9": 14,
  A: 11,
  "10": 10,
  K: 4,
  Q: 3,
  "8": 0,
  "7": 0,
};

const PLAIN_VALUES: Record<Rank, number> = {
  A: 11,
  "10": 10,
  K: 4,
  Q: 3,
  J: 2,
  "9": 0,
  "8": 0,
  "7": 0,
};

/** Whether a card counts as trump for value and ordering in this contract. */
export function isTrumpCard(card: Card, contract: Contract): boolean {
  if (contract.kind === "at") {
    return true;
  }

  if (contract.kind === "nt") {
    return false;
  }

  return card.suit === contract.suit;
}

/** Point value of a card in a contract (no-trump values are doubled). */
export function cardValue(card: Card, contract: Contract): number {
  const base = isTrumpCard(card, contract)
    ? TRUMP_VALUES[card.rank]
    : PLAIN_VALUES[card.rank];

  return contract.kind === "nt" ? base * 2 : base;
}

/** Bonus for winning the last trick (doubled in no-trump). */
export function dixDeDer(contract: Contract): number {
  return contract.kind === "nt" ? 20 : 10;
}

export function trickPoints(cards: readonly Card[], contract: Contract): number {
  return cards.reduce((total, card) => total + cardValue(card, contract), 0);
}
