export type Id = string;
export type Event = {
  fn_id: Id; // for declaration/change it is the function in which it happens or "global_space" is not in a function
  time: number;
  loc: string;
};

export type Var = {
  name: string;
  type: string;
  value: string;
};

export type CallEvent = Event & {
  event: "call";
  callee: Id;
};

export type EnterEvent = Event & {
  event: "enter";
  function_name: string;
  args: Var[];
};

export type ExitEvent = Event & {
  event: "exit";
  returnVal: string | null;
};

export type DeclareEvent = Event & {
  event: "declare";
  variable: Var;
  oldValue: string | null;
};

export type ChangeEvent = Event & {
  event: "change";
  variable: Var;
  oldValue: string;
};

export type TryEnterEvent = Event & {
  event: "try-enter";
};

export type CatchEnterEvent = Event & {
  event: "catch_enter";
  error: string;
};

export type LogEvent =
  | CallEvent
  | EnterEvent
  | ExitEvent
  | DeclareEvent
  | ChangeEvent
  | TryEnterEvent
  | CatchEnterEvent;
