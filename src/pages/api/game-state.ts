// src/pages/api/game-state.ts
// API endpoint to get and update player game state

import { NextApiRequest, NextApiResponse } from 'next';
import { sessionManager } from '../../services/session_service';
import { GameStateResponse } from '../../types/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GameStateResponse>
) {
  const sessionId = req.headers['x-session-id'] as string;

  if (!sessionId) {
    return res.status(401).json({
      success: false,
      error: 'Session ID required'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get current game state
        const gameState = sessionManager.getGameState(sessionId);
        
        if (!gameState) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        return res.status(200).json({
          success: true,
          gameState
        });

      case 'POST':
        // Update game state
        const updates = req.body;
        
        if (!updates || typeof updates !== 'object') {
          return res.status(400).json({
            success: false,
            error: 'Invalid update data'
          });
        }

        const success = sessionManager.updateGameState(sessionId, updates);
        
        if (!success) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        // Return updated game state
        const updatedGameState = sessionManager.getGameState(sessionId);
        return res.status(200).json({
          success: true,
          gameState: updatedGameState || undefined
        });

      default:
        return res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
    }

  } catch (error) {
    console.error('[game-state] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
