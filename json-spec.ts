type LogEvent = {
  fn_id: string; // for declaration/change it is the function in which it happens or "global_space" is not in a function
  time: number;
  loc: string;
};

type Var = {
  name: string;
  type: string;
  value: string;
};

type Enter = LogEvent & {
  event: "enter";
  function_name: string;
  args: Var[];
  parent: string | null;
};

type Exit = Enter & {
  event: "exit";
  returnVal: Var | null;
};

type Declare = LogEvent & {
  event: "declare";
  variable: Var;
  oldValue: string | null;
};

type Change = LogEvent & {
  event: "change";
  variable: Var;
  oldValue: string;
};

type TryEnter = LogEvent & {
  event: "try-enter";
};

type CatchEnter = LogEvent & {
  event: "catch_enter";
  error: string;
};
