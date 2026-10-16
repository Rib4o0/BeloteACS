import type { Card } from "../server/game/index.ts";
import { isRedSuit, suitSymbol } from "./table";

export type CardSize = "xs" | "sm" | "md" | "lg";

const FRAME: Record<CardSize, string> = {
  xs: "h-6 w-4",
  sm: "h-12 w-9 sm:h-16 sm:w-11",
  md: "h-16 w-11 sm:h-[5.5rem] sm:w-16",
  lg: "h-20 w-14 sm:h-28 sm:w-20",
};

const CORNER: Record<CardSize, string> = {
  xs: "text-[7px]",
  sm: "text-[11px] sm:text-sm",
  md: "text-[13px] sm:text-base",
  lg: "text-base sm:text-lg",
};

const PIP: Record<CardSize, string> = {
  xs: "text-[9px]",
  sm: "text-lg sm:text-2xl",
  md: "text-2xl sm:text-3xl",
  lg: "text-3xl sm:text-4xl",
};

/**
 * A crisp mini playing-card face: a corner index in two corners plus one large
 * centre pip. Hearts and diamonds render red, clubs and spades black.
 */
export function CardFace({
  card,
  size = "md",
  className = "",
}: {
  card: Card;
  size?: CardSize;
  className?: string;
}) {
  const ink = isRedSuit(card.suit) ? "text-red-600" : "text-zinc-900";
  const symbol = suitSymbol(card.suit);

  return (
    <span
      className={`relative inline-flex shrink-0 select-none flex-col rounded-md bg-white ring-1 ring-black/15 shadow-[0_2px_4px_rgba(0,0,0,0.28)] ${FRAME[size]} ${className}`}
    >
      <span
        className={`absolute left-1 top-0.5 flex flex-col items-center font-bold leading-[1.05] ${CORNER[size]} ${ink}`}
      >
        <span>{card.rank}</span>
        <span className="leading-none">{symbol}</span>
      </span>
      <span
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center pt-1 ${PIP[size]} ${ink}`}
      >
        {symbol}
      </span>
      <span
        aria-hidden="true"
        className={`absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center font-bold leading-[1.05] ${CORNER[size]} ${ink}`}
      >
        <span>{card.rank}</span>
        <span className="leading-none">{symbol}</span>
      </span>
    </span>
  );
}

/** The face-down back of a card, for hidden hands and undealt reserves. */
export function CardBack({
  size = "md",
  className = "",
}: {
  size?: CardSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 rounded-md bg-indigo-900 ring-1 ring-black/30 shadow-[0_2px_4px_rgba(0,0,0,0.3)] ${FRAME[size]} ${className}`}
    >
      <span className="absolute inset-[3px] rounded-[4px] border border-white/25 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.14)_0,rgba(255,255,255,0.14)_2px,transparent_2px,transparent_5px)]" />
    </span>
  );
}
