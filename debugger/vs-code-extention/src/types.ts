export interface VariableInfo {
  name: string;
  type: string;
  value: string;
}

export interface ArgInfo {
  name: string;
  type: string;
  value: string;
}

// The trace format is loose/dynamic (it's whatever the tracing tool prints),
// so we model it as a base shape plus free-form fields rather than a strict union.
export interface TraceEvent {
  time?: number;
  event: string;
  loc?: string;
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

  [key: string]: unknown;
}

export interface ParsedLocation {
  file: string;
  line: number; // 0-based
  column: number; // 0-based
}
