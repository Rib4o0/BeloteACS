import { applyAction, createMatch, seededRng, type Action, type Reason } from "./game/index.ts";
import type { Player, Room, Team } from "./definitions";
import { HEARTBEAT_TIMEOUT_MS, MAX_PLAYERS, MAX_PLAYERS_PER_TEAM } from "./rooms/constants.ts";
import { seatPlayers } from "./rooms/view.ts";

export { HEARTBEAT_TIMEOUT_MS, MAX_PLAYERS, MAX_PLAYERS_PER_TEAM };

export type JoinResult =
  | { ok: true; player: Player }
  | { ok: false; reason: "full" };

export type TeamResult =
  | { ok: true }
  | { ok: false; reason: "full" | "started" | "not_player" };

export type StartResult =
  | { ok: true }
  | { ok: false; reason: "not_host" | "need_four" | "teams_incomplete" };

export type LeaveResult =
  | { ok: true }
  | { ok: false; reason: "not_player" };

const globalForRooms = globalThis as unknown as { rooms?: Room[] };
const rooms = (globalForRooms.rooms ??= []);

export function fetchRooms() {
  return rooms;
}

export function findRoom(code: string) {
  const normalized = code.trim().toLowerCase();
  return rooms.find((room) => room.code === normalized);
}

function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0;
}

export function createRoom(seed?: number) {
  let code = "";

  do {
    code = Math.random().toString(36).substring(2, 6);
  } while (rooms.some((room) => room.code === code));

  const room: Room = {
    code,
    match: null,
    rng: seededRng(seed ?? randomSeed()),
    game: { playing: false, players: [] },
  };
  rooms.push(room);
  return room;
}

export function joinRoom(room: Room, playerId: string, name: string): JoinResult {
  const existing = room.game.players.find((player) => player.id === playerId);

  if (existing) {
    // Returning player (e.g. reconnecting after a disconnect): refresh their
    // heartbeat so they are not treated as stale.
    existing.lastSeen = Date.now();
    return { ok: true, player: existing };
  }

  if (room.game.players.length >= MAX_PLAYERS) {
    return { ok: false, reason: "full" };
  }

  const player: Player = {
    id: playerId,
    name,
    host: room.game.players.length === 0,
    lastSeen: Date.now(),
  };
  room.game.players.push(player);
  return { ok: true, player };
}

export function chooseTeam(room: Room, playerId: string, team: Team): TeamResult {
  if (room.game.playing) {
    return { ok: false, reason: "started" };
  }

  const player = room.game.players.find((entry) => entry.id === playerId);

  if (!player) {
    return { ok: false, reason: "not_player" };
  }

  const teammates = room.game.players.filter(
    (entry) => entry.team === team && entry.id !== playerId,
  );

  if (teammates.length >= MAX_PLAYERS_PER_TEAM) {
    return { ok: false, reason: "full" };
  }

  player.team = team;
  return { ok: true };
}

export function startGame(room: Room, actorId: string): StartResult {
  const host = room.game.players.find((player) => player.host);

  if (!host || host.id !== actorId) {
    return { ok: false, reason: "not_host" };
  }

  if (room.game.players.length !== MAX_PLAYERS) {
    return { ok: false, reason: "need_four" };
  }

  if (room.game.players.some((player) => !player.team)) {
    return { ok: false, reason: "teams_incomplete" };
  }

  room.match = createMatch(seatPlayers(room.game.players), room.rng);
  room.game.playing = true;
  return { ok: true };
}

export type GameActionError = Reason | "not_started";

export type GameActionResult =
  | { ok: true }
  | { ok: false; error: GameActionError };

/**
 * Applies a validated engine action to the room's match and stores the result.
 * The caller is responsible for having resolved `action.playerId` from the
 * player's cookie.
 */
export function applyGameAction(room: Room, action: Action): GameActionResult {
  if (!room.match) {
    return { ok: false, error: "not_started" };
  }

  const result = applyAction(room.match, action, room.rng);

  if (result.error) {
    return { ok: false, error: result.error };
  }

  room.match = result.match;
  return { ok: true };
}

/** Refreshes a player's heartbeat. Returns whether the player is in the room. */
export function touchPlayer(
  room: Room,
  playerId: string,
  now = Date.now(),
): boolean {
  const player = room.game.players.find((entry) => entry.id === playerId);

  if (!player) {
    return false;
  }

  player.lastSeen = now;
  return true;
}

/** Picks the first player as host when no one holds the role. */
function ensureHost(players: Player[]) {
  if (players.some((player) => player.host)) {
    return;
  }

  const first = players[0];

  if (first) {
    first.host = true;
  }
}

/**
 * Removes players whose heartbeat has gone stale. Before the game starts they
 * leave the room and free their seat; once started, seats are kept so players
 * can reconnect into their place.
 */
export function sweepStalePlayers(room: Room, now = Date.now()): void {
  if (room.game.playing) {
    return;
  }

  const active = room.game.players.filter(
    (player) => now - (player.lastSeen ?? 0) <= HEARTBEAT_TIMEOUT_MS,
  );

  room.game.players = active;
  ensureHost(active);
}

/** A player voluntarily leaves the room (only meaningful before the start). */
export function leaveRoom(room: Room, playerId: string): LeaveResult {
  const index = room.game.players.findIndex((player) => player.id === playerId);

  if (index === -1) {
    return { ok: false, reason: "not_player" };
  }

  room.game.players.splice(index, 1);
  ensureHost(room.game.players);
  return { ok: true };
}