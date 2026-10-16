import {
  cardValue,
  isTrumpCard,
  partnerSeat,
  trickOrder,
  trickWinner,
  type Action,
  type Card,
  type Contract,
  type PublicMatch,
  type Suit,
} from "./game/index.ts";

type BidAction = Extract<Action, { kind: "bid" }>;
type PlayAction = Extract<Action, { kind: "play" }>;

/** Minimum trump-score a suit needs before the bot will open on it. */
const BID_MIN_SCORE = 40;

/** The bot's cards valued as if `suit` were trump, so J/9 dominate. */
function suitScore(hand: readonly Card[], suit: Suit): number {
  const contract: Contract = { kind: "suit", suit };
  return hand.reduce((total, card) => total + cardValue(card, contract), 0);
}

/** Lowest by trick order, ties broken by point value. */
function pickLowest(actions: PlayAction[], contract: Contract): PlayAction {
  return actions.reduce((best, action) => {
    const order = trickOrder(action.card, contract);
    const bestOrder = trickOrder(best.card, contract);

    if (order !== bestOrder) {
      return order < bestOrder ? action : best;
    }

    return cardValue(action.card, contract) < cardValue(best.card, contract)
      ? action
      : best;
  });
}

/** Lowest by point value (a discard, not a win). */
function pickCheapest(actions: PlayAction[], contract: Contract): PlayAction {
  return actions.reduce((best, action) =>
    cardValue(action.card, contract) < cardValue(best.card, contract) ? action : best,
  );
}

function chooseBid(view: PublicMatch): Action | null {
  const bids = view.legal.filter(
    (action): action is BidAction => action.kind === "bid",
  );

  let best: BidAction | null = null;
  let bestScore = 0;

  for (const bid of bids) {
    if (bid.contract.kind !== "suit") continue;

    const score = suitScore(view.hand.hand, bid.contract.suit);

    if (score > bestScore) {
      bestScore = score;
      best = bid;
    }
  }

  if (best && bestScore >= BID_MIN_SCORE) {
    return best;
  }

  return view.legal.find((action) => action.kind === "pass") ?? null;
}

function choosePlay(view: PublicMatch): Action | null {
  const plays = view.legal.filter(
    (action): action is PlayAction => action.kind === "play",
  );

  const you = view.you;
  const contract = view.hand.contract;

  if (plays.length === 0 || you === null || !contract) {
    return null;
  }

  const trick = view.hand.trick;

  // Leading: try to drop a plain ace, otherwise open the lowest plain card.
  if (trick.length === 0) {
    const plainAce = plays.find(
      (action) => !isTrumpCard(action.card, contract) && action.card.rank === "A",
    );

    if (plainAce) return plainAce;

    const plain = plays.filter((action) => !isTrumpCard(action.card, contract));
    return pickLowest(plain.length > 0 ? plain : plays, contract);
  }

  if (trickWinner(trick, contract) === partnerSeat(you)) {
    return pickCheapest(plays, contract);
  }

  const winners = plays.filter(
    (action) =>
      trickWinner([...trick, { seat: you, card: action.card }], contract) === you,
  );

  return winners.length > 0
    ? pickLowest(winners, contract)
    : pickCheapest(plays, contract);
}

/**
 * A simple, deterministic legal move: open on the best suit when worth it,
 * otherwise pass; lead a plain ace or low; when following, discard under a
 * winning partner and beat an opponent as cheaply as possible.
 */
export function chooseAction(view: PublicMatch): Action | null {
  if (view.legal.length === 0) {
    return null;
  }

  return view.hand.phase === "bidding" ? chooseBid(view) : choosePlay(view);
}
