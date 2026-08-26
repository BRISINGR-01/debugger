export type Id = string; // <file>@<int>
export type Loc = {
  start: {
    line: number;
    col: number;
  };
  end: {
    line: number;
    col: number;
  };
};

export type Event = {
  ctx_id: Id;
  time: number;
  loc: Loc;
};

export type Var = {
  name: string;
  type: string;
  value: string;
};

export type CallEvent = Event & {
  event: "call";
  value: string;
  callee: Id;
};

export type EnterEvent = Event & {
  event: "enter";
  fn_name: string; // for declaration/change it is the function in which it happens or "global_space" is not in a function
  args: ({ loc: Loc } & Var)[];
};

export type ExitEvent = Event & {
  event: "exit";
  return_val: string | null;
};

export type DeclareEvent = Event & {
  event: "declare";
  var: Var;
};

export type ChangeEvent = Event & {
  event: "change";
  var: Var;
  old_val: string;
};

export type ErrorEvent = Event & {
  error: string;
};

export type TryEnterEvent = Event & {
  event: "try-enter";
};

export type CatchEnterEvent = Event & {
  event: "catch_enter";
  error: string;
};

export type IfEvent = Event & {
  event: "if";
  value: string;
};

export type IfBranchEvent = Event & {
  event: "if_branch";
  branch: "then" | "else_if" | "else";
  branchIndex: number;
};

export type InstError = Event & {
  event: "inst_error";
  message: string;
};

export type LogEvent =
  | CallEvent
  | EnterEvent
  | ExitEvent
  | DeclareEvent
  | ChangeEvent
  | TryEnterEvent
  | CatchEnterEvent
  | IfEvent
  | IfBranchEvent
  | InstError;
