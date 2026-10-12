import { useState, useEffect, useRef, useCallback } from 'react';

// Un ID nuevo por contexto JS: sessionStorage se copia al duplicar una pestaña en algunos
// navegadores y hacía que dos ventanas intentaran controlar el mismo jugador.
const TAB_PLAYER_ID = (() => {
  try { return globalThis.crypto?.randomUUID?.() || `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`; }
  catch { return `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`; }
})();

export function getPlayerSessionId() {
  return TAB_PLAYER_ID;
}

export function useGameSocket() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connectionError, setConnectionError] = useState('');
  const socketRef = useRef(null);
  const sequenceRef = useRef(0);

  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const configuredUrl = String(import.meta.env.VITE_WS_URL || '').trim();
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(host);
  // En local seguimos usando el puerto 8080. En producción la URL viene de VITE_WS_URL.
  const socketUrl = configuredUrl || (!import.meta.env.PROD || localHost ? `${protocol}//${host}:8080` : '');

  useEffect(() => {
    let disposed = false;
    let reconnectTimer = null;
    let reconnectDelay = 500;
    let currentSocket = null;

    if (!socketUrl) {
      setConnected(false);
      setConnectionError('Falta configurar VITE_WS_URL con la dirección pública del servidor de partidas.');
      return () => { disposed = true; };
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = reconnectDelay;
      setConnectionError(`Conexión con el servidor perdida. Reintentando en ${Math.ceil(delay / 1000)} s…`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
      reconnectDelay = Math.min(8000, Math.round(reconnectDelay * 1.7));
    };

    const connect = () => {
      if (disposed) return;
      setConnectionError('Conectando con el servidor local…');
      let ws;
      try {
        ws = new WebSocket(socketUrl);
      } catch {
        setConnected(false);
        scheduleReconnect();
        return;
      }
      currentSocket = ws;
      socketRef.current = ws;

      ws.onopen = () => {
        if (disposed || currentSocket !== ws) return;
        reconnectDelay = 500;
        setConnected(true);
        setConnectionError('');
        // Solicita estado inicial incluso cuando el frontend abrió antes que el servidor.
        try { ws.send(JSON.stringify({ type: 'LIST_ROOMS' })); } catch { /* onclose reintentará */ }
      };

      ws.onclose = () => {
        if (disposed || currentSocket !== ws) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (disposed || currentSocket !== ws) return;
        setConnected(false);
        // Cerrar dispara onclose, que realiza un reintento con espera progresiva.
        try { ws.close(); } catch { /* el timer de abajo sigue siendo la recuperación */ }
        scheduleReconnect();
      };

      ws.onmessage = (event) => {
        if (disposed || currentSocket !== ws) return;
        try {
          const data = JSON.parse(event.data);
          const entry = { sequence: ++sequenceRef.current, data };
          setMessages((current) => [...current, entry].slice(-200));
        } catch (error) {
          console.error('Error al procesar mensaje del socket:', error);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current = null;
      try { currentSocket?.close(); } catch { /* socket ya cerrado */ }
    };
  }, [socketUrl]);

  const send = useCallback((data) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { connected, messages, connectionError, send, socketUrl };
}
