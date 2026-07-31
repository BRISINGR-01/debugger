import { ArrowRightLeft } from "lucide-react";
import { ValueChip } from "./ValueChip";
import { shortLoc } from "../utils/format";

export function AssignRow({ item, dim, active }) {
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
