import { SUITS, type Suit } from "./cards.ts";

export type Contract =
  | { kind: "suit"; suit: Suit }
  | { kind: "nt" }
  | { kind: "at" };

/** Every contract, ascending by bid strength. */
export const CONTRACTS: Contract[] = [
  ...SUITS.map((suit): Contract => ({ kind: "suit", suit })),
  { kind: "nt" },
  { kind: "at" },
];

/** Bid strength: clubs 1 … spades 4, no-trump 5, all-trumps 6. */
export function bidStrength(contract: Contract): number {
  if (contract.kind === "suit") {
    return SUITS.indexOf(contract.suit) + 1;
  }

  return contract.kind === "nt" ? 5 : 6;
}

/** A bid is legal only when it is strictly stronger than the current one. */
export function isStronger(candidate: Contract, current: Contract): boolean {
  return bidStrength(candidate) > bidStrength(current);
}

/** The trump suit, or undefined for no-trump / all-trumps. */
export function trumpSuit(contract: Contract): Suit | undefined {
  return contract.kind === "suit" ? contract.suit : undefined;
}
