import { useState, useEffect } from "react";
import type { LogEvent } from "../../../json-spec";
import type { Status } from "../types";

export const WS_URL = "ws://localhost:5634";

export function useWebSocket() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<Status>("connecting");

  const handlePayload = (payload: "clear" | LogEvent | LogEvent[]) =>
    setEvents((prev) => {
      if (payload === "clear") return [];

      let ev = Array.isArray(payload) ? payload[0] : payload;

      // let insertI = 0;
      // for (let i = prev.length - 1; i >= 0; i--) {
      //   if (prev[i].time <= ev.time) {
      //     insertI = i;
      //     break;
      //   }
      // }

      // prev.splice(insertI, 0, ev);
      return [...prev, ev];
    });

  useEffect(() => {
    let socket: WebSocket;
    let retryTimer: number;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setStatus("open");

      socket.onmessage = (ev) => {
        let payload = ev.data;
        if (
          typeof payload === "string" &&
          payload.trim().toLowerCase() === "clear"
        )
          return handlePayload("clear");

        try {
          handlePayload(JSON.parse(payload));
        } catch {
          console.error("Invalid payload: " + payload);
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setStatus("closed");
          retryTimer = setTimeout(connect, 2000);
        }
      };

      socket.onerror = () => setStatus("error");
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
