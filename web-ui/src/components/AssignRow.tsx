import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { ValueChip } from "./ValueChip.js";
import { shortLoc } from "../utils/format.ts";
import type {
  ChangeEvent,
  DeclareEvent,
  ExitEvent,
} from "../../../json-spec.ts";

export function AssignRow({
  event,
  dim,
  active,
}: {
  event: DeclareEvent | ChangeEvent | ExitEvent;
  dim: boolean;
  active: boolean;
}) {
  if (event.event === "exit")
    return <ExitRow event={event} dim={dim} active={active} />;

  const label = event.event;

  return (
    <div
      className={`te-assign ${dim ? "te-dim" : ""} ${active ? "te-active-row" : ""}`}
    >
      <span className="te-assign-tag" data-kind={label}>
        {label}
      </span>
      <span>{event.variable.name}</span>
      {event.event === "declare" && (
        <ArrowRight size={11} className="te-arrow" />
      )}
      {event.event === "change" && event.oldValue !== null && (
        <>
          <ValueChip value={event.oldValue} />
          <ArrowRightLeft size={11} className="te-arrow" />
        </>
      )}
      <ValueChip value={event.variable.value} />
      <span className="te-loc" title={event.loc}>
        {shortLoc(event.loc)}
      </span>
      <span className="te-time">{event.time.toFixed(3)}</span>
    </div>
  );
}

export function ExitRow({
  event,
  dim,
  active,
}: {
  event: ExitEvent;
  dim: boolean;
  active: boolean;
}) {
  const label = "return";

  if (!event.returnVal) return <></>;

  return (
    <div
      className={`te-assign ${dim ? "te-dim" : ""} ${active ? "te-active-row" : ""}`}
    >
      <span className="te-assign-tag" data-kind={label}>
        {label}
      </span>
      <ValueChip value={event.returnVal!} />
      <span className="te-loc" title={event.loc}>
        {shortLoc(event.loc)}
      </span>
      <span className="te-time">{event.time.toFixed(3)}</span>
    </div>
  );
}
