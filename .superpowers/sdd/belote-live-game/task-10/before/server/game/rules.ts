import type { Card, Rank } from "./cards.ts";
import { trumpSuit, type Contract } from "./contracts.ts";
import { isTrumpCard } from "./values.ts";
import type { Play, Seat } from "./types.ts";

const TRUMP_ORDER: Record<Rank, number> = {
  "7": 0,
  "8": 1,
  Q: 2,
  K: 3,
  "10": 4,
  A: 5,
  "9": 6,
  J: 7,
};

const PLAIN_ORDER: Record<Rank, number> = {
  "7": 0,
  "8": 1,
  "9": 2,
  J: 3,
  Q: 4,
  K: 5,
  "10": 6,
  A: 7,
};

/** Strength of a card inside its own (trump vs plain) group for this contract. */
export function trickOrder(card: Card, contract: Contract): number {
  return isTrumpCard(card, contract) ? TRUMP_ORDER[card.rank] : PLAIN_ORDER[card.rank];
}

function highest(plays: readonly Play[], contract: Contract): Seat {
  let best = plays[0];

  for (const played of plays) {
    if (trickOrder(played.card, contract) > trickOrder(best.card, contract)) {
      best = played;
    }
  }

  return best.seat;
}

/**
 * The seat winning the trick. A trump beats any plain card; otherwise the
 * highest card of the led suit wins.
 */
export function trickWinner(plays: readonly Play[], contract: Contract): Seat {
  const ledSuit = plays[0].card.suit;
  const trump = trumpSuit(contract);

  if (trump) {
    const trumps = plays.filter((played) => played.card.suit === trump);
    return highest(trumps.length > 0 ? trumps : plays.filter((p) => p.card.suit === ledSuit), contract);
  }

  return highest(plays.filter((p) => p.card.suit === ledSuit), contract);
}

/**
 * The cards a player may legally play.
 *
 * `partnerIsMaster` must be true when the player's partner currently holds the
 * winning card of the trick. The forced-trump obligation only applies to suit
 * contracts.
 */
export function legalCards(
  hand: readonly Card[],
  trick: readonly Play[],
  contract: Contract,
  partnerIsMaster: boolean,
): Card[] {
  if (trick.length === 0) {
    return [...hand];
  }

  const ledSuit = trick[0].card.suit;
  const following = hand.filter((card) => card.suit === ledSuit);

  if (following.length > 0) {
    return following;
  }

  const trump = trumpSuit(contract);

  if (!trump || partnerIsMaster) {
    return [...hand];
  }

  const trumps = hand.filter((card) => card.suit === trump);

  if (trumps.length === 0) {
    return [...hand];
  }

  const trumpsOnTable = trick.filter((played) => played.card.suit === trump);

  if (trumpsOnTable.length === 0) {
    return trumps;
  }

  const bestTrump = Math.max(...trumpsOnTable.map((played) => trickOrder(played.card, contract)));
  const overTrumps = trumps.filter((card) => trickOrder(card, contract) > bestTrump);

  return overTrumps.length > 0 ? overTrumps : trumps;
}
