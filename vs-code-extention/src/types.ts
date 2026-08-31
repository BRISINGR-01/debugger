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
