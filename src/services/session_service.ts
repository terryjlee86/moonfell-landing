// src/services/session_service.ts
// Session management service for multi-player game state isolation

import { PlayerSession, PlayerGameState } from "../types/session";
import { getCharacter } from "../state/character";
import { getInventory } from "../state/inventory";
import { getContext } from "../state/context";
import { getEnvironment } from "../state/environment";
import { getLearned } from "../state/learned";
import { getGameplay } from "../state/gameplay";

export class SessionManager {
  private sessions = new Map<string, PlayerSession>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Start cleanup timer for expired sessions
    setInterval(() => this.cleanupExpiredSessions(), this.CLEANUP_INTERVAL);
  }

  /**
   * Create a new player session with initial game state
   */
  createSession(playerId: string): PlayerSession {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    
    const session: PlayerSession = {
      sessionId,
      playerId,
      createdAt: now,
      lastActivity: now,
      gameState: this.createInitialGameState()
    };
    
    this.sessions.set(sessionId, session);
    console.log(`[SessionManager] Created session ${sessionId} for player ${playerId}`);
    return session;
  }

  /**
   * Get an existing session by session ID
   */
  getSession(sessionId: string): PlayerSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.sessions.delete(sessionId);
      console.log(`[SessionManager] Session ${sessionId} expired and removed`);
      return null;
    }

    // Update last activity
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Update game state for a specific session
   */
  updateGameState(sessionId: string, updates: Partial<PlayerGameState>): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.gameState = { ...session.gameState, ...updates };
    session.lastActivity = Date.now();
    console.log(`[SessionManager] Updated game state for session ${sessionId}`);
    return true;
  }

  /**
   * Get current game state for a session
   */
  getGameState(sessionId: string): PlayerGameState | null {
    const session = this.getSession(sessionId);
    return session ? session.gameState : null;
  }

  /**
   * Check if a session is valid and active
   */
  isSessionValid(sessionId: string): boolean {
    return this.getSession(sessionId) !== null;
  }

  /**
   * Get all active sessions (for debugging/admin)
   */
  getActiveSessions(): PlayerSession[] {
    return Array.from(this.sessions.values()).filter(session => 
      !this.isSessionExpired(session)
    );
  }

  /**
   * Create initial game state for new players
   */
  private createInitialGameState(): PlayerGameState {
    return {
      character: getCharacter(),
      inventory: getInventory(),
      context: getContext(),
      environment: getEnvironment(),
      learned: getLearned(),
      gameplay: getGameplay()
    };
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if a session has expired
   */
  private isSessionExpired(session: PlayerSession): boolean {
    return Date.now() - session.lastActivity > this.SESSION_TIMEOUT;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
      console.log(`[SessionManager] Cleaned up expired session ${sessionId}`);
    });

    if (expiredSessions.length > 0) {
      console.log(`[SessionManager] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
