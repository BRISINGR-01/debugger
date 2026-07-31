import { ChevronRight, ChevronDown } from "lucide-react";
import { TimeTrack } from "./TimeTrack";
import { AssignRow } from "./AssignRow";
import { frameHasMatch } from "../utils/search";
import { fmtArgs } from "../utils/format";
import "../App.css";

const DEPTH_COLORS = [
  "#5b8dee",
  "#c97b5f",
  "#4fc1b0",
  "#b98cce",
  "#e0b04f",
  "#6fcf97",
];

export function FrameNode({
  node,
  depth,
  minTime,
  maxTime,
  currentTime,
  search,
  collapsed,
  toggle,
}) {
  const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const isCollapsedByUser = collapsed.has(node.id);
  const hasMatch = search ? frameHasMatch(node, search) : false;
  const effectiveCollapsed = isCollapsedByUser && !hasMatch;
  const searchActive = search.length > 0;
  const selfMatch =
    searchActive &&
    (node.name.toLowerCase().includes(search.toLowerCase()) ||
      node.args.some(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          String(a.val).toLowerCase().includes(search.toLowerCase()),
      ));

  const started = node.enterTime <= currentTime;
  const ended = node.exitTime !== null && node.exitTime <= currentTime;
  const running = started && !ended;
  const notYet = !started;
  const crashed = node.exitTime === null && node.enterTime < maxTime;

  const varCount = node.timeline.filter((t) => t.kind !== "call").length;
  const callCount = node.timeline.filter((t) => t.kind === "call").length;
  const duration =
    node.exitTime !== null ? node.exitTime - node.enterTime : null;

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
        <span className={`te-frame-name ${selfMatch ? "te-hl" : ""}`}>
          {node.name}
        </span>
        <span className="te-frame-args">{fmtArgs(node.args)}</span>

        {running && <span className="te-badge te-badge-running">running</span>}
        {crashed && (
          <span
            className="te-badge te-badge-crash"
            title="No matching exit event has arrived for this frame"
          >
            no exit yet
          </span>
        )}

        <span className="te-frame-meta">
          {varCount > 0 && (
            <span>
              {varCount} var{varCount !== 1 ? "s" : ""}
            </span>
          )}
          {callCount > 0 && (
            <span>
              {callCount} call{callCount !== 1 ? "s" : ""}
            </span>
          )}
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
                    !node.timeline.some(
                      (o) =>
                        o.kind !== "call" &&
                        o.time > item.time &&
                        o.time <= currentTime,
                    ))
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
