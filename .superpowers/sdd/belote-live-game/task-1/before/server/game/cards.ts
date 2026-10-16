import type { Rng } from "./rng.ts";

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Card = { suit: Suit; rank: Rank };

/** Suits in ascending bid strength. */
export const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const RANKS: Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

export function newDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

/** Returns a shuffled copy of `items`, leaving the input untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
