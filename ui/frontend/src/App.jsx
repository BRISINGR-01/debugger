import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Search,
  AlertTriangle,
  ArrowRightLeft,
  Sparkles,
  Trash2,
  Radio,
} from "lucide-react";

/**
 * ── Trace Explorer (live) ───────────────────────────────────────────────
 * Connects to ws://localhost:8000/ws and renders whatever debugger trace
 * events arrive as a nested "call rail": one container per stack frame,
 * holding its own variable-change log plus, in chronological order, the
 * child frames it called.
 *
 * Protocol expected on the socket:
 *  - a JSON object  → one trace event (enter / exit / change / declare / warn)
 *  - a JSON array    → a batch of trace events, applied in order
 *  - the string "clear" (plain text or JSON-encoded) → wipes the trace and
 *    starts over, e.g. when the debugged program is relaunched
 *
 * ------------------------------------------------------------------------
 */

const WS_URL = "ws://localhost:8000/ws";
const DEPTH_COLORS = ["#5b8dee", "#c97b5f", "#4fc1b0", "#b98cce", "#e0b04f", "#6fcf97"];

function shortLoc(loc) {
  if (!loc) return "";
  const parts = loc.split("/");
  return parts[parts.length - 1];
}

function buildForest(events) {
  const nodes = {};
  for (const e of events) {
    switch (e.event) {
      case "enter":
        nodes[e.id] = {
          id: e.id,
          name: e.function_name,
          args: e.args || [],
          loc: e.loc,
          enterTime: e.time,
          exitTime: null,
          exitLoc: null,
          returnVal: undefined,
          parent: e.parent,
          timeline: [],
        };
        break;
      case "exit":
        nodes[e.id].exitTime = e.time;
        nodes[e.id].exitLoc = e.loc;
        nodes[e.id].returnVal = e.returnVal;
        break

      case "change":
      case "declare":
        nodes[e.fn_id].timeline.push({
          kind: e.event,
          time: e.time,
          variable: e.variable,
          oldValue: e.oldValue === undefined ? null : e.oldValue,
          newValue: e.newValue,
          loc: e.loc,
        });
        break;

      default:
        break;
    }
  }

  const roots = [];
  Object.values(nodes).forEach((n) => {
    if (n.parent && nodes[n.parent]) {
      nodes[n.parent].timeline.push({ kind: "call", time: n.enterTime, node: n });
    } else {
      roots.push(n);
    }
  });
  Object.values(nodes).forEach((n) => n.timeline.sort((a, b) => a.time - b.time));
  return { roots, nodes };
}

function frameHasMatch(node, q) {
  if (!q) return false;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  if (node.args.some((a) => a.name.toLowerCase().includes(low) || String(a.val).toLowerCase().includes(low)))
    return true;
  return node.timeline.some((item) => {
    if (item.kind === "call") return frameHasMatch(item.node, q);
    return (
      item.variable.toLowerCase().includes(low) ||
      String(item.newValue).toLowerCase().includes(low) ||
      String(item.oldValue).toLowerCase().includes(low)
    );
  });
}

function fmtArgs(args) {
  if (!args || args.length === 0) return "()";
  return "(" + args.map((a) => `${a.name}=${a.val}`).join(", ") + ")";
}

function ValueChip({ value }) {
  if (value === null || value === undefined) {
    return <span className="te-chip te-chip-null">null</span>;
  }
  const isStruct = typeof value === "string" && value.startsWith("{");
  const isPtr = typeof value === "string" && value.startsWith("0x");
  return (
    <span className={`te-chip ${isStruct ? "te-chip-struct" : isPtr ? "te-chip-ptr" : "te-chip-val"}`}>
      {value}
    </span>
  );
}

function AssignRow({ item, dim, active }) {
  const label = item.kind
  return (
    <div className={`te-assign ${dim ? "te-dim" : ""} ${active ? "te-active-row" : ""}`}>
      <span className="te-assign-tag" data-kind={item.kind}>
        {label}
      </span>
      <span className="te-var-name">{item.variable}</span>
      {item.oldValue !== null && (
        <>
          <ValueChip value={item.oldValue} />
          <ArrowRightLeft size={11} className="te-arrow" />
        </>
      )}
      <ValueChip value={item.newValue} />
      <span className="te-loc" title={item.loc}>
        {shortLoc(item.loc)}
      </span>
      <span className="te-time">{item.time.toFixed(3)}</span>
    </div>
  );
}

function TimeTrack({ min, max, start, end, color }) {
  const span = Math.max(max - min, 0.001);
  const left = ((start - min) / span) * 100;
  const width = Math.max(((Math.max(end, start) - start) / span) * 100, 0.6);
  return (
    <div className="te-track">
      <div className="te-track-fill" style={{ left: `${left}%`, width: `${width}%`, background: color }} />
    </div>
  );
}

function FrameNode({ node, depth, minTime, maxTime, currentTime, search, collapsed, toggle }) {
  const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const isCollapsedByUser = collapsed.has(node.id);
  const hasMatch = search ? frameHasMatch(node, search) : false;
  const effectiveCollapsed = isCollapsedByUser && !hasMatch;
  const searchActive = search.length > 0;
  const selfMatch =
    searchActive &&
    (node.name.toLowerCase().includes(search.toLowerCase()) ||
      node.args.some(
        (a) => a.name.toLowerCase().includes(search.toLowerCase()) || String(a.val).toLowerCase().includes(search.toLowerCase())
      ));

  const started = node.enterTime <= currentTime;
  const ended = node.exitTime !== null && node.exitTime <= currentTime;
  const running = started && !ended;
  const notYet = !started;
  const crashed = node.exitTime === null && node.enterTime < maxTime;

  const varCount = node.timeline.filter((t) => t.kind !== "call").length;
  const callCount = node.timeline.filter((t) => t.kind === "call").length;
  const duration = node.exitTime !== null ? node.exitTime - node.enterTime : null;

  return (
    <div
      className={`te-frame ${notYet ? "te-dim" : ""} ${searchActive && !hasMatch && !selfMatch ? "te-dim-strong" : ""}`}
      style={{ borderLeftColor: color }}
    >
      <button
        className="te-frame-header"
        onClick={() => toggle(node.id)}
        style={{ background: `${color}14` }}
      >
        {effectiveCollapsed ? (
          <ChevronRight size={14} className="te-chevron" />
        ) : (
          <ChevronDown size={14} className="te-chevron" />
        )}
        <span className="te-dot" style={{ background: color }} />
        <span className={`te-frame-name ${selfMatch ? "te-hl" : ""}`}>{node.name}</span>
        <span className="te-frame-args">{fmtArgs(node.args)}</span>

        {running && <span className="te-badge te-badge-running">running</span>}
        {crashed && (
          <span className="te-badge te-badge-crash" title="No matching exit event has arrived for this frame">
            no exit yet
          </span>
        )}

        <span className="te-frame-meta">
          {varCount > 0 && <span>{varCount} var{varCount !== 1 ? "s" : ""}</span>}
          {callCount > 0 && <span>{callCount} call{callCount !== 1 ? "s" : ""}</span>}
          {duration !== null && <span>{duration.toFixed(2)}ms</span>}
        </span>
      </button>

      <div className="te-frame-track-row">
        <TimeTrack
          min={minTime}
          max={maxTime}
          start={node.enterTime}
          end={node.exitTime ?? maxTime}
          color={color}
        />
      </div>


      {!effectiveCollapsed && (
        <div className="te-frame-body">
          {node.timeline.length === 0 && <div className="te-empty">no recorded activity</div>}
          {node.timeline.map((item, i) =>
            item.kind === "call" ? (
              <FrameNode
                key={item.node.id + i}
                node={item.node}
                depth={depth + 1}
                minTime={minTime}
                maxTime={maxTime}
                currentTime={currentTime}
                search={search}
                collapsed={collapsed}
                toggle={toggle}
              />
            ) : (
              <AssignRow
                key={item.variable + item.time}
                item={item}
                dim={item.time > currentTime}
                active={
                  Math.abs(item.time - currentTime) < 1.5 ||
                  (item.time <= currentTime &&
                    !node.timeline.some((o) => o.kind !== "call" && o.time > item.time && o.time <= currentTime))
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    connecting: { color: "#e8a33d", label: "connecting…" },
    open: { color: "#6fcf97", label: "connected" },
    closed: { color: "#7c8797", label: "disconnected — retrying" },
    error: { color: "#d9695f", label: "connection error — retrying" },
  };
  const s = map[status] || map.connecting;
  return (
    <span className="te-status">
      <span className="te-status-dot" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}22` }} />
      {s.label}
    </span>
  );
}

export default function TraceExplorer() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [currentTime, setCurrentTime] = useState(0);
  const [liveFollow, setLiveFollow] = useState(true);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(null);

  // ── WebSocket connection with auto-reconnect ──────────────────────────
  useEffect(() => {
    let socket;
    let retryTimer;
    let cancelled = false;

    const handlePayload = (payload) => {
      if (payload === "clear") {
        setEvents([]);
        setCurrentTime(0);
        setCollapsed(new Set());
        setLiveFollow(true);
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

  const { roots } = useMemo(() => buildForest(events), [events]);


  const toggle = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const warnEvent = [...events].reverse().find((e) => e.event === "warn");

  const times = events.map((e) => e.time).filter((t) => typeof t === "number");
  const minTime = times.length ? Math.min(...times) : 0;
  const maxTime = times.length ? Math.max(...times) : 0;

  // follow the live edge of the trace unless the user has taken the wheel
  useEffect(() => {
    if (liveFollow) setCurrentTime(maxTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxTime, liveFollow]);

  const PLAY_DURATION_MS = 7000;
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const start = performance.now();
    const startTime = currentTime >= maxTime ? minTime : currentTime;
    const tick = (now) => {
      const frac = (now - start) / PLAY_DURATION_MS;
      const t = startTime + frac * (maxTime - startTime);
      if (t >= maxTime) {
        setCurrentTime(maxTime);
        setPlaying(false);
        return;
      }
      setCurrentTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  console.clear()
  console.log(events)

  const frameCount = events.filter((e) => e.event === "enter").length;
  const assignCount = events.filter((e) => e.event === "change" || e.event === "declare").length;
  const pct = maxTime > minTime ? ((currentTime - minTime) / (maxTime - minTime)) * 100 : 0;


  return (
    <div className="te-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .te-root {
          --bg: #10141b;
          --panel: #161b24;
          --panel-alt: #1b212c;
          --border: #262e3a;
          --text: #e6e9ef;
          --muted: #7c8797;
          --amber: #e8a33d;
          --danger: #d9695f;

          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif;
          border-radius: 12px;
          padding: 20px;
          min-height: 100%;
          box-sizing: border-box;
        }
        .te-root * { box-sizing: border-box; }
        .te-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        .te-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
          flex-wrap: wrap;
        }
        .te-title {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .te-title .te-sub {
          font-size: 12px;
          font-weight: 500;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .te-stats {
          display: flex;
          gap: 14px;
          font-size: 12px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .te-stats b { color: var(--text); font-weight: 600; }

        .te-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .te-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .te-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 14px 0 10px;
          padding: 10px 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          flex-wrap: wrap;
        }
        .te-search {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 5px 9px;
          flex: 1;
          min-width: 160px;
        }
        .te-search input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 13px;
          width: 100%;
          font-family: 'JetBrains Mono', monospace;
        }
        .te-search input::placeholder { color: var(--muted); }
        .te-search svg { color: var(--muted); flex-shrink: 0; }

        .te-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 7px;
          padding: 6px 11px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .te-btn:hover { border-color: var(--amber); background: #1e2530; }
        .te-btn.te-btn-primary { background: var(--amber); color: #1a1305; border-color: var(--amber); font-weight: 600; }
        .te-btn.te-btn-primary:hover { filter: brightness(1.08); }
        .te-btn.te-btn-live { border-color: #6fcf97; color: #6fcf97; }

        .te-scrubber-wrap {
          margin: 4px 2px 18px;
          padding: 12px 14px 10px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .te-scrubber-label {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 6px;
        }
        .te-scrubber-label .te-now { color: var(--amber); font-weight: 600; }
        input[type="range"].te-range {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, var(--amber) ${pct}%, #2a3240 ${pct}%);
          outline: none;
          cursor: pointer;
        }
        input[type="range"].te-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--amber);
          border: 2px solid #1a1305;
          box-shadow: 0 0 0 3px rgba(232,163,61,0.25);
          cursor: pointer;
        }
        input[type="range"].te-range::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--amber); border: 2px solid #1a1305; cursor: pointer;
        }

        .te-empty-state {
          padding: 40px 20px;
          text-align: center;
          color: var(--muted);
          font-size: 13px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          font-family: 'JetBrains Mono', monospace;
        }

        .te-frame {
          border-left: 3px solid;
          border-radius: 8px;
          background: var(--panel);
          margin: 8px 0;
          overflow: hidden;
          transition: opacity .25s;
        }
        .te-frame .te-frame { background: var(--panel-alt); }
        .te-dim { opacity: 0.32; }
        .te-dim-strong { opacity: 0.22; }

        .te-frame-header {
          all: unset;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 13px;
        }
        .te-chevron { color: var(--muted); flex-shrink: 0; }
        .te-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .te-frame-name {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
        }
        .te-frame-args {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .te-hl { background: rgba(232,163,61,0.25); border-radius: 3px; padding: 0 3px; }

        .te-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 2px 6px;
          border-radius: 20px;
          flex-shrink: 0;
        }
        .te-badge-running { background: rgba(232,163,61,0.18); color: var(--amber); }
        .te-badge-crash { background: rgba(217,105,95,0.18); color: var(--danger); }

        .te-frame-meta {
          margin-left: auto;
          display: flex;
          gap: 10px;
          font-size: 11px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
          flex-shrink: 0;
        }

        .te-frame-track-row { padding: 0 10px 8px; }
        .te-track {
          position: relative;
          height: 4px;
          background: #232b38;
          border-radius: 2px;
          overflow: hidden;
        }
        .te-track-fill { position: absolute; top: 0; height: 100%; border-radius: 2px; opacity: 0.85; }

        .te-frame-body {
          padding: 2px 10px 10px 22px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .te-empty { font-size: 12px; color: var(--muted); font-style: italic; padding: 4px 0; }

        .te-assign {
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 5px;
          background: rgba(255,255,255,0.02);
          transition: background .2s, box-shadow .2s;
        }
        .te-active-row {
          background: rgba(232,163,61,0.09);
          box-shadow: inset 0 0 0 1px rgba(232,163,61,0.35);
        }
        .te-assign-tag {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 1px 5px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .te-assign-tag[data-kind="declare"] { background: rgba(91,141,238,0.18); color: #8fb1f5; }
        .te-assign-tag[data-kind="assign"] { background: rgba(79,193,176,0.18); color: #7fd6c4; }
        .te-var-name { color: var(--text); font-weight: 600; min-width: 44px; }
        .te-arrow { color: var(--muted); flex-shrink: 0; }

        .te-chip {
          padding: 1px 7px;
          border-radius: 4px;
          font-size: 11.5px;
          white-space: nowrap;
        }
        .te-chip-val { background: rgba(255,255,255,0.06); color: var(--text); }
        .te-chip-struct { background: rgba(185,140,206,0.16); color: #d1a9e3; }
        .te-chip-ptr { background: rgba(224,176,79,0.14); color: var(--amber); }
        .te-chip-null { background: rgba(255,255,255,0.04); color: var(--muted); font-style: italic; }

        .te-loc {
          margin-left: auto;
          color: var(--muted);
          font-size: 10.5px;
          white-space: nowrap;
        }
        .te-time { color: #566072; font-size: 10.5px; width: 56px; text-align: right; flex-shrink: 0; }

        .te-warn-banner {
          margin-top: 16px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(217,105,95,0.08);
          border: 1px solid rgba(217,105,95,0.3);
          font-size: 12.5px;
        }
        .te-warn-banner svg { color: var(--danger); flex-shrink: 0; margin-top: 1px; }
        .te-warn-banner .te-warn-title { font-weight: 600; color: var(--text); font-family: 'JetBrains Mono', monospace; }

        .te-legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--muted);
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .te-legend-item { display: flex; align-items: center; gap: 5px; }
        .te-legend-swatch { width: 9px; height: 9px; border-radius: 2px; }
      `}</style>

      <div className="te-header">
        <div className="te-title">
          <Sparkles size={17} color="#e8a33d" />
          Trace Explorer
          <span className="te-sub">{WS_URL}</span>
        </div>
        <div className="te-stats">
          <StatusDot status={status} />
          <span><b>{frameCount}</b> frames</span>
          <span><b>{assignCount}</b> variable events</span>
          <span><b>{(maxTime - minTime).toFixed(1)}ms</b> span</span>
        </div>
      </div>

      <div className="te-toolbar">
        <div className="te-search">
          <Search size={14} />
          <input
            placeholder="Filter by function or variable name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="te-btn" onClick={() => setCollapsed(new Set())}>
          Expand all
        </button>
        <button
          className="te-btn"
          onClick={() => {
            const all = new Set();
            const walk = (n) => {
              if (n.timeline.some((t) => t.kind === "call")) all.add(n.id);
              n.timeline.forEach((t) => t.kind === "call" && walk(t.node));
            };
            roots.forEach(walk);
            setCollapsed(all);
          }}
        >
          Collapse all
        </button>
        <button
          className="te-btn"
          onClick={() => {
            setEvents([]);
            setCurrentTime(0);
            setCollapsed(new Set());
            setLiveFollow(true);
          }}
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>

      {events.length === 0 ? (
        <div className="te-empty-state">
          Waiting for trace events from <span className="te-mono">{WS_URL}</span>…
        </div>
      ) : (
        <>
          <div className="te-scrubber-wrap">
            <div className="te-scrubber-label">
              <span>playhead</span>
              <span className="te-now te-mono">t = {currentTime.toFixed(2)}ms</span>
            </div>
            <input
              type="range"
              className="te-range"
              min={minTime}
              max={maxTime}
              step={0.01}
              value={currentTime}
              onChange={(e) => {
                setPlaying(false);
                setLiveFollow(false);
                setCurrentTime(parseFloat(e.target.value));
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="te-btn te-btn-primary"
                onClick={() => {
                  setLiveFollow(false);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause size={13} /> : <Play size={13} />}
                {playing ? "Pause" : "Replay run"}
              </button>
              <button
                className={`te-btn ${liveFollow ? "te-btn-live" : ""}`}
                onClick={() => {
                  setPlaying(false);
                  setLiveFollow(true);
                  setCurrentTime(maxTime);
                }}
              >
                <Radio size={13} />
                {liveFollow ? "Live" : "Go live"}
              </button>
              <button
                className="te-btn"
                onClick={() => {
                  setPlaying(false);
                  setLiveFollow(false);
                  setCurrentTime(maxTime);
                }}
              >
                <RotateCcw size={13} />
                Jump to end
              </button>
            </div>
          </div>

          {roots.map((root) => (
            <FrameNode
              key={root.id}
              node={root}
              depth={0}
              minTime={minTime}
              maxTime={maxTime}
              currentTime={currentTime}
              search={search}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}

          {warnEvent && currentTime >= warnEvent.time && (
            <div className="te-warn-banner">
              <AlertTriangle size={16} />
              <div className="te-warn-title">
                {warnEvent.message} — t={warnEvent.time.toFixed(3)}ms
              </div>
            </div>
          )}

          <div className="te-legend">
            <div className="te-legend-item">
              <span className="te-legend-swatch" style={{ background: "#8fb1f5" }} />
              declared
            </div>
            <div className="te-legend-item">
              <span className="te-legend-swatch" style={{ background: "#7fd6c4" }} />
              assigned / updated
            </div>
            <div className="te-legend-item">
              <span className="te-legend-swatch" style={{ background: "#e8a33d" }} />
              pointer value
            </div>
            <div className="te-legend-item">
              <span className="te-legend-swatch" style={{ background: "#d1a9e3" }} />
              struct value
            </div>
            <div className="te-legend-item">
              <span className="te-legend-swatch" style={{ background: "#d9695f" }} />
              no exit received yet
            </div>
          </div>
        </>
      )}
    </div>
  );
}