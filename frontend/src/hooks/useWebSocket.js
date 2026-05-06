import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to connect to a meeting's WebSocket for live updates.
 *
 * Key design: onMessage is stored in a ref so the WS connection is stable
 * and only reconnects when meetingId changes — not on every re-render.
 * This prevents the status_change events being missed due to reconnect loops.
 *
 * @param {number|string} meetingId
 * @param {function} onMessage - called with {type, data} for each event
 */
export default function useWebSocket(meetingId, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const [connected, setConnected] = useState(false);

  // Always keep the latest callback in a ref — no reconnect needed when it changes
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!meetingId) return;

    // Clear any pending reconnect
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    // Close existing connection cleanly
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null; // prevent auto-reconnect from old close
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = '8000';
    const url = `${protocol}://${host}:${port}/ws/meetings/${meetingId}/`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s — captures stable `connect` reference
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => {
      ws.close(); // triggers onclose → reconnect
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Always calls the CURRENT handler via ref — no stale closure
        onMessageRef.current?.(msg);
      } catch {}
    };
  }, [meetingId]); // ← Only reconnect when meeting changes, NOT when handler changes

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
