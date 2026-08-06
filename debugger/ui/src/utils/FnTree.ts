import type {
  CallEvent,
  ChangeEvent,
  DeclareEvent,
  EnterEvent,
  ExitEvent,
  Id,
  LogEvent,
  Var,
} from "../../../../json-spec";

export interface FnNode {
  id: Id;
  name: string;
  args: Var[];
  loc: string;
  time: number;
  exitTime: number | null;
  returnVal: string | null;
  parent: Id | null;
  timeline: LogEvent[];
}

export default class FnTree {
  root: FnNode;
  nodes: Record<Id, FnNode> = {};
  private calls: Array<{
    calleeName: string;
    caller: FnNode;
  }> = [];

  constructor(events: LogEvent[]) {
    this.root = this.createNode("0");
    this.root.name = "global";

    for (const e of events) {
      switch (e.event) {
        case "call":
          this.call(e);
          break;
        case "enter":
          this.enter(e);
          break;

        case "exit":
          this.exit(e);
          break;

        case "change":
        case "declare":
          this.alterVar(e);
          break;

        default:
          break;
      }
    }
  }

  call(ev: CallEvent) {
    const caller = ev.fn_id,
      callee = ev.callee;

    this.calls.push({ calleeName: callee, caller: this.nodes[caller] });
    this.nodes[caller].timeline.push(ev);
  }

  enter(ev: EnterEvent) {
    console.log(ev, this.nodes);

    const node = this.createNode(ev.fn_id);
    const parentIndex = this.calls.findLastIndex(
      (c) => c.calleeName === ev.function_name,
    );

    const parent = this.calls[parentIndex].caller;
    if (!ev.function_name.startsWith("ArrayExpression."))
      this.calls.splice(parentIndex, 1);

    node.name = ev.function_name;
    node.args = ev.args;
    node.loc = ev.loc;
    node.parent = parent.id;
    node.time = ev.time;

    parent.timeline.push(ev);
  }

  exit(ev: ExitEvent) {
    this.nodes[ev.fn_id].returnVal = ev.returnVal;
    this.nodes[ev.fn_id].exitTime = ev.time;
    this.nodes[ev.fn_id].timeline.push(ev);
    this.nodes[ev.fn_id].timeline.sort((a, b) => a.time - b.time);
  }

  alterVar(e: ChangeEvent | DeclareEvent) {
    console.log(e, this.nodes);

    this.nodes[e.fn_id].timeline.push(e);
  }

  createNode(id: Id): FnNode {
    return (this.nodes[id] = {
      id,
      name: "",
      args: [],
      exitTime: null,
      loc: "",
      parent: null,
      returnVal: null,
      time: 0,
      timeline: [],
    });
  }
}
