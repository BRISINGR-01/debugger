export type Id = string; // <file>@<fn_decl line>:<int>
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
  val: string;
};

export type Arg = Var & {
  loc: Loc;
};

export type CallEvent = Event & {
  event: "call";
  value: string;
  callee: Id;
};

export type EnterEvent = Event & {
  event: "enter";
  fn_name: string;
  args: Arg[];
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

export type Expression = Event & {
  event: "expr";
  val: string;
};

export type ThrowEvent = Event & {
  event: "throw";
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
  isTruthy: boolean;
};

export type InstError = Event & {
  event: "inst_error";
  message: string;
};

export type LogEvent =
  | CallEvent
  | Expression
  | EnterEvent
  | ExitEvent
  | ChangeEvent
  | DeclareEvent
  | TryEnterEvent
  | ThrowEvent
  | CatchEnterEvent
  | IfEvent
  | InstError;
