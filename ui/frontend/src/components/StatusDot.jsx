export function StatusDot({ status }) {
  const map = {
    connecting: { color: "#e8a33d", label: "connecting\u2026" },
    open: { color: "#6fcf97", label: "connected" },
    closed: { color: "#7c8797", label: "disconnected \u2014 retrying" },
    error: { color: "#d9695f", label: "connection error \u2014 retrying" },
  };
  const s = map[status] || map.connecting;
  return (
    <span className="te-status">
      <span
        className="te-status-dot"
        style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}22` }}
      />
      {s.label}
    </span>
  );
}
