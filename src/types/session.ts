// src/types/session.ts
// Session management types for multi-player game state isolation

import { CharacterState } from "../state/character";
import { InventoryState } from "../state/inventory";
import { ContextState } from "../state/context";
import { EnvironmentState } from "../state/environment";
import { LearnedState } from "../state/learned";
import { GameplayState } from "../state/gameplay";
import { CombatTurnState } from "./combat";

export type PlayerSession = {
  sessionId: string;        // Unique identifier for this player session
  playerId: string;         // Player's name/identifier
  createdAt: number;        // Timestamp when session was created
  lastActivity: number;     // Timestamp of last player activity
  gameState: PlayerGameState; // All game data for this player
};

export type PlayerGameState = {
  character: CharacterState;
  inventory: InventoryState;
  context: ContextState;
  environment: EnvironmentState;
  learned: LearnedState;
  gameplay: GameplayState;
  combat?: CombatTurnState;
};

export type SessionResponse = {
  sessionId: string;
  gameState: PlayerGameState;
  success: boolean;
  error?: string;
};

export type GameStateUpdate = {
  sessionId: string;
  updates: Partial<PlayerGameState>;
};

export type GameStateResponse = {
  success: boolean;
  gameState?: PlayerGameState;
  error?: string;
};
