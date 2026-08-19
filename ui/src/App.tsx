import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Radio,
} from "lucide-react";
import FnTree from "./utils/FnTree.ts";
import { StatusDot } from "./components/StatusDot.tsx";
import { FrameNode } from "./components/FrameNode.tsx";
import "./App.css";
import "./index.css";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { usePlayback } from "./hooks/usePlayback.ts";
import type { Id } from "../../json-spec.ts";

const WS_URL = "ws://localhost:8000/ws";

export default function TraceExplorer() {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set<Id>());
  const [currentTime, setCurrentTime] = useState(0);
  const [liveFollow, setLiveFollow] = useState(true);
  const [playing, setPlaying] = useState(false);

  const { events, setEvents, status } = useWebSocket();
  console.log("events", events);

  const tree = useMemo(() => new FnTree(events), [events]);
  console.log("root", tree);

  const toggle = useCallback((id: Id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  // const warnEvent = [...events].reverse().find((e) => e.event === "warn");

  const times = events.map((e) => e.time);
  const minTime = times.length ? Math.min(...times) : 0;
  const maxTime = times.length ? Math.max(...times) : 0;

  useEffect(() => {
    if (liveFollow) setCurrentTime(maxTime);
  }, [maxTime, liveFollow]);

  usePlayback(
    playing,
    currentTime,
    setCurrentTime,
    minTime,
    maxTime,
    setPlaying,
  );

  const frameCount = events.filter((e) => e.event === "enter").length;
  const assignCount = events.filter(
    (e) => e.event === "change" || e.event === "declare",
  ).length;
  const pct =
    maxTime > minTime
      ? ((currentTime - minTime) / (maxTime - minTime)) * 100
      : 0;

  return (
    <div className="te-root">
      <style>{`
        input[type="range"].te-range {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, var(--amber) ${pct}%, #2a3240 ${pct}%);
          outline: none;
          cursor: pointer;
        }
      `}</style>

      <div className="te-header">
        <div className="te-title">
          <Sparkles size={17} color="#e8a33d" />
          Trace Explorer
          <span className="te-sub">{WS_URL}</span>
        </div>
        <div className="te-stats">
          <StatusDot status={status} />
          <span>
            <b>{frameCount}</b> frames
          </span>
          <span>
            <b>{assignCount}</b> variable events
          </span>
          <span>
            <b>{(maxTime - minTime).toFixed(1)}ms</b> span
          </span>
        </div>
      </div>

      <div className="te-toolbar">
        <div className="te-search">
          <Search size={14} />
          <input
            placeholder="Filter by function or variable name\u2026"
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
            setCollapsed(new Set(Object.keys(tree.nodes)));
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
          Waiting for trace events from{" "}
          <span className="te-mono">{WS_URL}</span>
        </div>
      ) : (
        <>
          <div className="te-scrubber-wrap">
            <div className="te-scrubber-label">
              <span>playhead</span>
              <span className="te-now te-mono">
                t = {currentTime.toFixed(2)}ms
              </span>
            </div>
            <input
              type="range"
              className="te-range"
              min={minTime}
              max={maxTime}
              step={0.01}
              value={currentTime}
              style={{
                background: `linear-gradient(to right, var(--amber) ${pct}%, #2a3240 ${pct}%)`,
              }}
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

          <FrameNode
            key={tree.root.id}
            tree={tree}
            node={tree.root}
            depth={0}
            minTime={minTime}
            maxTime={maxTime}
            currentTime={currentTime}
            search={search}
            collapsed={collapsed}
            toggle={toggle}
          />

          {/* {warnEvent && currentTime >= warnEvent.time && (
            <div className="te-warn-banner">
              <AlertTriangle size={16} />
              <div className="te-warn-title">
                {warnEvent.message} \u2014 t={warnEvent.time.toFixed(3)}ms
              </div>
            </div>
          )} */}

          <div className="te-legend">
            <div className="te-legend-item">
              <span
                className="te-legend-swatch"
                style={{ background: "#8fb1f5" }}
              />
              declared
            </div>
            <div className="te-legend-item">
              <span
                className="te-legend-swatch"
                style={{ background: "#7fd6c4" }}
              />
              assigned / updated
            </div>
            <div className="te-legend-item">
              <span
                className="te-legend-swatch"
                style={{ background: "#e8a33d" }}
              />
              pointer value
            </div>
            <div className="te-legend-item">
              <span
                className="te-legend-swatch"
                style={{ background: "#d1a9e3" }}
              />
              struct value
            </div>
            <div className="te-legend-item">
              <span
                className="te-legend-swatch"
                style={{ background: "#d9695f" }}
              />
              no exit received yet
            </div>
          </div>
        </>
      )}
    </div>
  );
}
