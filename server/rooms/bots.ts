import type { Player, Room, Team } from "../definitions.ts";
import { MAX_PLAYERS } from "./constants.ts";

export type AddBotReason = "not_host" | "full" | "started";

export type AddBotResult =
  | { ok: true; player: Player }
  | { ok: false; reason: AddBotReason };

/** User-facing message for each rejection, as pinned by the spec. */
export const ADD_BOT_ERRORS: Record<AddBotReason, string> = {
  not_host: "Only the host can add bots",
  full: "Room is full",
  started: "The game has already started",
};

/** True when the id belongs to a server-controlled bot in this room. */
export function isBot(room: Room, playerId: string): boolean {
  return room.game.players.some(
    (player) => player.id === playerId && player.bot === true,
  );
}

/** The smallest index whose id is free in this room. */
function nextBotIndex(room: Room): number {
  let index = 1;
  while (
    room.game.players.some((player) => player.id === `bot:${room.code}:${index}`)
  ) {
    index += 1;
  }
  return index;
}

/** The team with fewer players right now; ties go to A. */
function emptierTeam(room: Room): Team {
  const a = room.game.players.filter((player) => player.team === "A").length;
  const b = room.game.players.filter((player) => player.team === "B").length;
  return a <= b ? "A" : "B";
}

/**
 * Adds a server-controlled bot to the next empty seat, on the emptier team.
 * Mirrors `startGame(room, actorId)`: only the host may add a bot.
 */
export function addBot(room: Room, actorId: string): AddBotResult {
  const host = room.game.players.find((player) => player.host);

  if (!host || host.id !== actorId) {
    return { ok: false, reason: "not_host" };
  }

  if (room.game.playing) {
    return { ok: false, reason: "started" };
  }

  if (room.game.players.length >= MAX_PLAYERS) {
    return { ok: false, reason: "full" };
  }

  const index = nextBotIndex(room);
  const player: Player = {
    id: `bot:${room.code}:${index}`,
    name: `Bot ${index}`,
    host: false,
    team: emptierTeam(room),
    bot: true,
  };

  room.game.players.push(player);
  return { ok: true, player };
}
