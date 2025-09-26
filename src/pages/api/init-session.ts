// src/pages/api/init-session.ts
// API endpoint to create a new player session

import { NextApiRequest, NextApiResponse } from 'next';
import { sessionManager } from '../../services/session_service';
import { SessionResponse } from '../../types/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      sessionId: '',
      gameState: {} as any,
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { playerId } = req.body;

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({
        sessionId: '',
        gameState: {} as any,
        success: false,
        error: 'Player ID is required'
      });
    }

    // Create new session
    const session = sessionManager.createSession(playerId);

    return res.status(200).json({
      sessionId: session.sessionId,
      gameState: session.gameState,
      success: true
    });

  } catch (error) {
    console.error('[init-session] Error:', error);
    return res.status(500).json({
      sessionId: '',
      gameState: {} as any,
      success: false,
      error: 'Internal server error'
    });
  }
}
