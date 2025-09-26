// src/pages/session-test.tsx
// Simple test page to verify session isolation

import { useState } from 'react';

export default function SessionTest() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [testResults, setTestResults] = useState<string[]>([]);

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const initializeSession = async () => {
    try {
      const response = await fetch('/api/init-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: `test_player_${Date.now()}` })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSessionId(data.sessionId);
        setGameState(data.gameState);
        addResult(`✅ Session created: ${data.sessionId}`);
      } else {
        addResult(`❌ Session creation failed: ${data.error}`);
      }
    } catch (error) {
      addResult(`❌ Session creation error: ${error}`);
    }
  };

  const testGameStateUpdate = async () => {
    if (!sessionId) return;
    
    try {
      const updates = {
        context: {
          nearby: [
            { id: 'test-goblin', kind: 'goblin', attitude: 'hostile', distanceM: 10 }
          ]
        }
      };

      const response = await fetch('/api/game-state', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify(updates)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setGameState(data.gameState);
        addResult(`✅ Game state updated successfully`);
      } else {
        addResult(`❌ Game state update failed: ${data.error}`);
      }
    } catch (error) {
      addResult(`❌ Game state update error: ${error}`);
    }
  };

  const testSessionStatus = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch('/api/session-status', {
        headers: { 'x-session-id': sessionId }
      });
      
      const data = await response.json();
      
      if (data.valid) {
        addResult(`✅ Session is valid`);
      } else {
        addResult(`❌ Session is invalid: ${data.error}`);
      }
    } catch (error) {
      addResult(`❌ Session status check error: ${error}`);
    }
  };

  const testInvalidSession = async () => {
    try {
      const response = await fetch('/api/session-status', {
        headers: { 'x-session-id': 'invalid_session_id' }
      });
      
      const data = await response.json();
      
      if (!data.valid) {
        addResult(`✅ Invalid session properly rejected`);
      } else {
        addResult(`❌ Invalid session was accepted (this is bad!)`);
      }
    } catch (error) {
      addResult(`❌ Invalid session test error: ${error}`);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Session System Test</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>Current Session</h2>
        <p><strong>Session ID:</strong> {sessionId || 'None'}</p>
        <p><strong>Game State:</strong> {gameState ? 'Loaded' : 'None'}</p>
        {gameState?.context?.nearby && (
          <p><strong>Nearby Creatures:</strong> {gameState.context.nearby.length}</p>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Test Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button onClick={initializeSession} style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Initialize Session
          </button>
          <button onClick={testGameStateUpdate} style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Test Game State Update
          </button>
          <button onClick={testSessionStatus} style={{ padding: '0.5rem 1rem', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Test Session Status
          </button>
          <button onClick={testInvalidSession} style={{ padding: '0.5rem 1rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Test Invalid Session
          </button>
          <button onClick={clearResults} style={{ padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Clear Results
          </button>
        </div>
      </div>

      <div>
        <h2>Test Results</h2>
        <div style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '1rem', 
          borderRadius: '4px',
          maxHeight: '300px',
          overflowY: 'auto',
          border: '1px solid #ddd'
        }}>
          {testResults.length === 0 ? (
            <p>No tests run yet. Click the buttons above to test the session system.</p>
          ) : (
            testResults.map((result, index) => (
              <div key={index} style={{ marginBottom: '0.5rem', fontFamily: 'monospace', fontSize: '14px' }}>
                {result}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#e8f4fd', borderRadius: '4px', border: '1px solid #b8daff' }}>
        <h3>🧪 Testing Instructions:</h3>
        <ol>
          <li><strong>Open this page in 2 different browser windows</strong> (or incognito tabs)</li>
          <li>Click <strong>"Initialize Session"</strong> in both windows</li>
          <li>Verify each window gets a <strong>different Session ID</strong></li>
          <li>Click <strong>"Test Game State Update"</strong> in one window</li>
          <li>Verify the other window's game state is <strong>unchanged</strong></li>
          <li>Click <strong>"Test Session Status"</strong> to verify session validity</li>
          <li>Click <strong>"Test Invalid Session"</strong> to verify security</li>
          <li><strong>Success:</strong> Each player has isolated game state!</li>
        </ol>
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
        <h3>🔍 What to Look For:</h3>
        <ul>
          <li><strong>Unique Session IDs:</strong> Each window should have different session IDs</li>
          <li><strong>Isolated State:</strong> Changes in one window don't affect the other</li>
          <li><strong>Valid Sessions:</strong> Real sessions should be accepted</li>
          <li><strong>Invalid Sessions:</strong> Fake session IDs should be rejected</li>
          <li><strong>No Errors:</strong> All API calls should succeed without errors</li>
        </ul>
      </div>
    </div>
  );
}