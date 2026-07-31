import { useState, useEffect } from "react";

const WS_URL = "ws://localhost:8000/ws";

export function useWebSocket() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    let socket;
    let retryTimer;
    let cancelled = false;

    const handlePayload = (payload) => {
      if (payload === "clear") {
        setEvents([]);
        return;
      }
      setEvents((prev) => [...prev, ...(Array.isArray(payload) ? payload : [payload])]);
    };

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setStatus("open");

      socket.onmessage = (ev) => {
        let payload;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          payload = ev.data;
        }
        if (typeof payload === "string" && payload.trim().toLowerCase() === "clear") {
          handlePayload("clear");
        } else {
          handlePayload(payload);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        retryTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        setStatus("error");
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (socket) socket.close();
    };
  }, []);

  return { events, setEvents, status };
}
