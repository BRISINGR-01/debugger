export function buildForest(events) {
  console.log(events);

  const nodes = {};
  for (const e of events) {
    switch (e.type) {
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
        break;

      case "change":
      case "declare":
        if (e.fn_id)
          nodes[e.fn_id].timeline.push({
            kind: e.event,
            time: e.time,
            variable: e.variable,
            oldValue: e.oldValue,
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
      nodes[n.parent].timeline.push({
        kind: "call",
        time: n.enterTime,
        node: n,
      });
    } else {
      roots.push(n);
    }
  });
  Object.values(nodes).forEach((n) =>
    n.timeline.sort((a, b) => a.time - b.time),
  );
  return { roots, nodes };
}
