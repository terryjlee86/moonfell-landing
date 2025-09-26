// src/pages/api/session-status.ts
// API endpoint to check session validity

import { NextApiRequest, NextApiResponse } from 'next';
import { sessionManager } from '../../services/session_service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.headers['x-session-id'] as string;

  if (!sessionId) {
    return res.status(400).json({ 
      valid: false, 
      error: 'Session ID required' 
    });
  }

  try {
    const isValid = sessionManager.isSessionValid(sessionId);
    
    return res.status(200).json({
      valid: isValid,
      sessionId
    });

  } catch (error) {
    console.error('[session-status] Error:', error);
    return res.status(500).json({
      valid: false,
      error: 'Internal server error'
    });
  }
}
