import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to connect to a meeting's WebSocket for live updates.
 * @param {number|string} meetingId
 * @param {function} onMessage - called with {type, data} for each event
 */
export default function useWebSocket(meetingId, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!meetingId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const port = '8000'; // Django backend port
    const url = `${protocol}://${host}:${port}/ws/meetings/${meetingId}/`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      setTimeout(() => connect(), 3000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessage?.(msg);
      } catch {}
    };
  }, [meetingId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
