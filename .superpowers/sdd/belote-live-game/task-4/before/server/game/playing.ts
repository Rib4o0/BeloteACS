import { sameCard, type Card } from "./cards.ts";
import { legalCards, trickWinner } from "./rules.ts";
import { nextSeat, partnerSeat, type PlayingHand, type Seat } from "./types.ts";

/** The cards the seat may legally play right now. */
export function legalPlays(hand: PlayingHand, seat: Seat): Card[] {
  const partnerIsMaster =
    hand.trick.length > 0 && trickWinner(hand.trick, hand.contract) === partnerSeat(seat);

  return legalCards(hand.hands[seat], hand.trick, hand.contract, partnerIsMaster);
}

/** Plays a card, advancing the turn and resolving the trick after the 4th play. */
export function reducePlay(hand: PlayingHand, seat: Seat, card: Card): PlayingHand {
  const hands = {
    ...hand.hands,
    [seat]: hand.hands[seat].filter((held) => !sameCard(held, card)),
  };
  const trick = [...hand.trick, { seat, card }];

  if (trick.length === 4) {
    return {
      ...hand,
      hands,
      trick: [],
      tricks: [...hand.tricks, trick],
      turn: trickWinner(trick, hand.contract),
    };
  }

  return { ...hand, hands, trick, turn: nextSeat(seat) };
}
