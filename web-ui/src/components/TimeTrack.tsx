export function TimeTrack({
  min,
  max,
  start,
  end,
  color,
}: {
  min: number;
  max: number;
  start: number;
  end: number;
  color: string;
}) {
  const span = Math.max(max - min, 0.001);
  const left = ((start - min) / span) * 100;
  const width = Math.max(((Math.max(end, start) - start) / span) * 100, 0.6);
  return (
    <div className="te-track">
      <div
        className="te-track-fill"
        style={{ left: `${left}%`, width: `${width}%`, background: color }}
      />
    </div>
  );
}
