import { publicState } from "../game/index.ts";
import { chooseAction } from "../bot.ts";
import { applyGameAction, fetchRooms } from "../Rooms.ts";
import { broadcast } from "./broadcast.ts";
import { isBot } from "./bots.ts";
import type { Room } from "../definitions.ts";

/** How long between bot moves (one move per room per tick). */
export const TICK_MS = 700;

const globalForDriver = globalThis as unknown as {
  botDriverTimer?: ReturnType<typeof setInterval>;
};

/**
 * If the seat on turn belongs to a bot, applies one legal bot action and
 * broadcasts the result. Returns whether it acted. Free of timers, so it is
 * unit-testable without waiting on a tick.
 */
export function pumpRoom(room: Room): boolean {
  const match = room.match;

  if (!match || match.winner) {
    return false;
  }

  const playerId = match.seats[match.hand.turn];

  if (!isBot(room, playerId)) {
    return false;
  }

  const action = chooseAction(publicState(match, playerId));

  if (!action) {
    return false;
  }

  const result = applyGameAction(room, action);

  if (!result.ok) {
    return false;
  }

  broadcast(room);
  return true;
}

/**
 * Registers the process-wide ticker once. Every tick advances at most one
 * action per room (so bot moves stay watchable), and it keeps running whether
 * or not anyone is connected. Safe to call repeatedly.
 */
export function ensureBotDriver(): void {
  if (globalForDriver.botDriverTimer) {
    return;
  }

  const timer = setInterval(() => {
    for (const room of fetchRooms()) {
      pumpRoom(room);
    }
  }, TICK_MS) as ReturnType<typeof setInterval> & { unref?: () => void };

  // Never hold a bare Node process open on our behalf (Next keeps its own loop,
  // and the ticker keeps firing for as long as that loop lives).
  timer.unref?.();
  globalForDriver.botDriverTimer = timer;
}

/** Cancels the ticker (used by tests and shutdown). */
export function stopBotDriver(): void {
  if (globalForDriver.botDriverTimer) {
    clearInterval(globalForDriver.botDriverTimer);
    globalForDriver.botDriverTimer = undefined;
  }
}

/** Whether the ticker is currently registered. */
export function botDriverRunning(): boolean {
  return globalForDriver.botDriverTimer !== undefined;
}
