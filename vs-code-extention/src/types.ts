export interface VariableInfo {
  name: string;
  type: string;
  value: string;
}

export interface ArgInfo {
  name: string;
  type: string;
  value: string;
  loc?: TraceLoc;
}

export interface TraceLoc {
  start: string; // "file:line:col" (1-based line, 0-based col)
  end: string; // exclusive
}

// The trace format is loose/dynamic (it's whatever the tracing tool prints),
// so we model it as a base shape plus free-form fields rather than a strict union.
export interface TraceEvent {
  time: number;
  event: string;
  loc?: string | TraceLoc;
  fn_id?: string;

  // 'declare'
  variable?: VariableInfo;

  // 'call'
  callee?: string;

  // 'enter'
  function_name?: string;
  args?: ArgInfo[];

  // 'return'
  value?: unknown;

  // 'throw'
  error?: unknown;

  // 'if_branch'
  branch?: "then" | "else_if" | "else";
  branchIndex?: number;

  [key: string]: unknown;
}

export interface ParsedLocation {
  file: string;
  line: number; // 0-based start line
  column: number; // 0-based start column
  endLine: number; // 0-based end line (exclusive)
  endColumn: number; // 0-based end column (exclusive)
}
