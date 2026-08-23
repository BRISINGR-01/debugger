#!/usr/bin/env python3

import lldb
import os
import sys
import json
import time
import argparse
from typing import Optional

RESET = "\033[0m"
BOLD = "\033[1m"
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
DIM = "\033[2m"

_AGGREGATE_TYPE_CLASSES = (
    lldb.eTypeClassStruct,
    lldb.eTypeClassClass,
    lldb.eTypeClassUnion,
)


def _val_to_str(sbvalue: lldb.SBValue) -> str:
    if not sbvalue.IsValid():
        return "<invalid>"
    summary = sbvalue.GetSummary()
    value = sbvalue.GetValue()
    if summary:
        return summary
    if value:
        return value
    num_children = sbvalue.GetNumChildren()
    if num_children:
        parts = []
        for i in range(min(num_children, 8)):
            child = sbvalue.GetChildAtIndex(i)
            parts.append(f"{child.GetName()}={child.GetValue() or '?'}")
        suffix = ", ..." if num_children > 8 else ""
        return "{" + ", ".join(parts) + suffix + "}"
    return "<no value>"


def _frame_vars(frame: lldb.SBFrame) -> dict:
    snapshot = {}
    variables = frame.GetVariables(True, True, True, False)
    for v in variables:
        if v.GetName() != "this" and v.IsValid():
            val = _val_to_str(v)
            if val != "<no value>":
                snapshot[v.GetName()] = val
    return snapshot


def _format_args(frame: lldb.SBFrame) -> list[dict]:
    args = frame.GetVariables(True, False, False, False)
    parts = []
    for a in args:
        if a.IsValid() and a.GetName() != "this":
            parts.append({"name": a.GetName(), "val": a.GetValue()})

    return parts


fn_ids = set()


def _new_fn_id(frame: lldb.SBFrame, depth: int):
    id = _get_fn_id(frame, depth)

    count = 0
    for fn_id in fn_ids:
        if fn_id == id or str.startswith(fn_id, id + "_"):
            count += 1

    if count != 0:
        id += f"_{count}"

    fn_ids.add(id)
    print(fn_ids)
    return id


def _get_fn_id(frame: lldb.SBFrame, depth: int):
    return f"{frame.function.mangled or "main"}_{depth}"


def _is_user_frame(frame: lldb.SBFrame, user_dirs: list) -> bool:
    """
    True if this frame's source file lives under one of user_dirs.

    Uses realpath + startswith (not exact equality) so it still matches
    when the file is in a subdirectory of the project, or reached via a
    symlink. Exact-equality matching against os.getcwd() is the classic
    reason this silently returns False for every frame: the compiler
    almost never embeds exactly os.getcwd() as the directory unless you
    build from that literal directory.
    """
    line_entry = frame.GetLineEntry()
    if not line_entry.IsValid():
        return False
    directory = line_entry.GetFileSpec().GetDirectory()
    if not directory:
        return False
    try:
        real_dir = os.path.realpath(directory)
    except OSError:
        return False
    return any(real_dir == d or real_dir.startswith(d + os.sep) for d in user_dirs)


# ──────────────────────────────────────────────────────────────────────────
# Recorder - owns all events, the on-disk log, and rendering. Mirrors the
# JS Recorder: things call .emit(...) to record a fact, and separately
# ask the Recorder to .print()/.summary() when they want it displayed.
# ──────────────────────────────────────────────────────────────────────────


class Recorder:
    def __init__(
        self, output_file: Optional[str] = None, log_path: Optional[str] = None
    ):
        self.events: list = []
        self._start_time = self._now()

        self.out = open(output_file, "w") if output_file else sys.stdout

        self._log_path = log_path or os.path.join(os.getcwd(), ".trace", "log")
        os.makedirs(os.path.dirname(self._log_path), exist_ok=True)
        self._log_file = open(self._log_path, "w")

    @staticmethod
    def _now() -> float:
        return time.perf_counter() * 1000.0

    def emit(self, event: dict):
        ev = dict(event)
        ev["time"] = round(self._now() - self._start_time, 3)
        self.events.append(ev)
        self._append_log(ev)
        print(ev)

    def _append_log(self, ev: dict):
        self._log_file.write(json.dumps(ev, default=str) + "\n")
        self._log_file.flush()

    def _use_color(self) -> bool:
        return bool(getattr(self.out, "isatty", lambda: False)())

    def _c(self, code: str, s: str) -> str:
        return f"\033[{code}m{s}{RESET}" if self._use_color() else s

    def _dim(self, s: str) -> str:
        return self._c("2", s)

    def _loc_suffix(self, loc: Optional[str]) -> str:
        return f"  {self._dim('[' + loc + ']')}" if loc else ""

    def print(self):
        depth = 0
        indent = lambda d: "  " * d

        print(
            "\n── Tracer trace ────────────────────────────────────────", file=self.out
        )

        for e in self.events:
            t = f"[+{e['time']:>9.3f}ms]"
            loc = self._loc_suffix(e.get("loc"))
            etype = e["event"]

            if etype == "enter":
                parent = (
                    f" {self._c('33', '(' + e['parent'] + ')')}"
                    if e.get("parent")
                    else ""
                )
                print(
                    f"{self._dim(t)} {indent(depth)}{self._c('96', '->')} "
                    f"{self._c('1', e['function_name'])}({e.get('args', '')}){parent}{loc}",
                    file=self.out,
                )
                depth += 1

            elif etype == "exit":
                depth = max(0, depth - 1)
                ret_val = e.get("returnVal")
                ret = f" -> {ret_val}" if ret_val else ""
                print(
                    f"{self._dim(t)} {indent(depth)}{self._c('32', '<-')} "
                    f"{self._dim('RETURN ' + e['function_name'])}{self._c('32', ret)}{loc}",
                    file=self.out,
                )

            elif etype == "declare":
                print(
                    f"{self._dim(t)} {indent(depth)}{self._c('32', '+')} "
                    f"{e['variable']} = {e['newValue']}{loc}",
                    file=self.out,
                )

            elif etype == "assign":
                print(
                    f"{self._dim(t)} {indent(depth)}{self._c('33', '~')} "
                    f"{e['variable']}: {self._c('31', str(e['oldValue']))} -> "
                    f"{self._c('32', str(e['newValue']))}{loc}",
                    file=self.out,
                )

            elif etype == "outofscope":
                print(
                    f"{self._dim(t)} {indent(depth)}{self._dim('- ' + e['variable'] + ' (out of scope)')}{loc}",
                    file=self.out,
                )

            elif etype == "warn":
                print(f"{self._c('91', '[tracer] ' + e['message'])}", file=self.out)

        print(
            "──────────────────────────────────────────────────────────\n",
            file=self.out,
        )

    def summary(self):
        """Per-function call counts and total time spent inside each,
        matching the shape of the JS Recorder's summary()."""
        calls: dict = {}
        starts: dict = {}
        durations: dict = {}

        for e in self.events:
            if e["event"] == "enter":
                calls[e["function_name"]] = calls.get(e["function_name"], 0) + 1
                starts[e["function_name"]] = e["time"]
            elif e["event"] == "exit" and e["function_name"] in starts:
                start = starts.pop(e["function_name"])
                durations[e["function_name"]] = durations.get(
                    e["function_name"], 0.0
                ) + (e["time"] - start)

        print(
            "\n── Summary ───────────────────────────────────────────────",
            file=self.out,
        )
        for fn, count in calls.items():
            ms = durations.get(fn)
            ms_str = f" ({ms:.2f}ms total)" if ms is not None else ""
            plural = "s" if count != 1 else ""
            print(f"  {fn}: {count} call{plural}{ms_str}", file=self.out)
        print(
            "──────────────────────────────────────────────────────────\n",
            file=self.out,
        )

    def close(self):
        if self.out is not sys.stdout:
            self.out.close()
        self._log_file.close()


# ──────────────────────────────────────────────────────────────────────────
# FnBlock - one instance per *live* call frame. Owns that frame's variable
# state and turns diffs into Recorder events. Nothing here prints directly;
# it only ever talks to the Recorder.
# ──────────────────────────────────────────────────────────────────────────


class FnBlock:
    def __init__(
        self,
        recorder: Recorder,
        frame: lldb.SBFrame,
        fn_id: int,
        depth: int,
    ):
        self.recorder = recorder
        self.function = frame.GetFunctionName() or "<unknown>"
        self.fn_id = _new_fn_id(frame, depth)
        self.variables = _frame_vars(frame)
        for v in self.variables:
            self.variables[v] = None

        parent_frame = frame.parent
        parent_id = None
        if self.function != "main" and parent_frame and parent_frame.IsValid():
            parent_id = _get_fn_id(parent_frame, depth - 1)

        self.loc = str(frame.function.addr.GetLineEntry())

        recorder.emit(
            {
                "id": self.fn_id,
                "event": "enter",
                "function_name": self.function,
                "args": _format_args(frame),
                "parent": parent_id,
                "loc": self.loc,
            }
        )

    def sync(self, frame: lldb.SBFrame, loc: str):
        variables = frame.GetVariables(True, True, True, False)
        for v in variables:
            name = v.GetName()
            if name == "this" or not v.IsValid():
                continue
            self._sync_value(v, name, loc, seen=set())

    def _sync_value(self, v: lldb.SBValue, name: str, loc: str, seen: set):
        type_class = v.GetType().GetCanonicalType().GetTypeClass()
        is_aggregate = type_class in _AGGREGATE_TYPE_CLASSES
        num_children = v.GetNumChildren()

        if is_aggregate and num_children > 0:
            # guard against self-referential / cyclic structures
            addr = v.GetLoadAddress()
            key = (addr, v.GetTypeName())
            if addr != lldb.LLDB_INVALID_ADDRESS and key in seen:
                return
            seen = seen | {key}

            for i in range(num_children):
                child = v.GetChildAtIndex(i)
                child_name = child.GetName()
                if not child_name:
                    continue
                self._sync_value(child, f"{name}.{child_name}", loc, seen)
            return

        # leaf value (primitive, pointer, enum, etc.)
        if not v.changed and name in self.variables:
            return

        val = _val_to_str(v)
        if val == "<no value>":
            return

        old_val = self.variables.get(name)
        if old_val == val:
            return

        self.recorder.emit(
            {
                "fn_id": self.fn_id,
                "event": "declare" if old_val is None else "change",
                "variable": name,
                "oldValue": old_val,
                "newValue": val,
                "loc": loc,
            }
        )
        self.variables[name] = val

    def exit(self, ret_str: Optional[str], loc: str = ""):
        self.recorder.emit(
            {
                "id": self.fn_id,
                "event": "exit",
                "function_name": self.function,
                "returnVal": ret_str,
                "loc": loc,
            }
        )


class Tracer:
    def __init__(
        self,
        target: lldb.SBTarget,
        user_dirs: list,
        recorder: Recorder,
        max_steps: int = 500_000,
    ):
        self.target = target
        self.user_dirs = user_dirs
        self.recorder = recorder
        self.fn_blocks: dict = {}  # fn_id -> FnBlock, only for *live* frames
        self.current_fn_block: FnBlock
        self.total_steps = 0
        self.call_depth = 0
        self.max_steps = max_steps
        self.prev_fn_block: FnBlock | None = None

    def step(self, process: lldb.SBProcess) -> bool:
        """Log the current stop. Returns False if tracing should stop."""
        self.total_steps += 1
        if self.total_steps > self.max_steps:
            self.recorder.emit(
                {
                    "event": "warn",
                    "message": f"max_steps={self.max_steps} reached - stopping.",
                }
            )
            process.Stop()
            return False

        thread: lldb.SBThread = process.GetSelectedThread()
        if not thread or not thread.IsValid():
            return True

        frame: lldb.SBFrame = thread.GetFrameAtIndex(0)
        if not frame or not frame.IsValid():
            return True

        depth = thread.GetNumFrames()
        fn_id = _get_fn_id(frame, depth)
        # This is the line we've just stopped *at* - i.e. about to execute,
        # not the line that just ran. Any diff we're about to observe was
        # caused by whatever line the frame's FnBlock last recorded.
        loc = str(frame.GetLineEntry())

        print(depth)
        print(frame.GetFunctionName())
        print(frame.GetLineEntry())
        fn_block: FnBlock | None = self.fn_blocks.get(fn_id)

        if depth > self.call_depth:
            self.call_depth = depth
            fn_block = self.new_fn(fn_id, depth, frame)
        elif depth < self.call_depth:
            if fn_block:
                fn_id = fn_block.fn_id
                if self.prev_fn_block:
                    fn_block.fn_id = self.prev_fn_block.fn_id
                fn_block.sync(
                    frame, self.prev_fn_block.loc if self.prev_fn_block else loc
                )
                fn_block.fn_id = fn_id
            self.call_depth = depth
            if self.prev_fn_block is None:
                return True

            ret = thread.GetStopReturnValue()
            ret_str = _val_to_str(ret) if ret and ret.IsValid() else None
            self.prev_fn_block.exit(ret_str, loc)
            self.fn_blocks.pop(self.prev_fn_block.fn_id, None)
        elif fn_block:
            fn_block.sync(frame, self.prev_fn_block.loc if self.prev_fn_block else loc)

        self.prev_fn_block = fn_block
        return True

    def new_fn(self, fn_id, depth, frame: lldb.SBFrame):
        block = FnBlock(self.recorder, frame, fn_id, depth)
        self.fn_blocks[fn_id] = block
        return block


def run_trace(
    exe: str,
    args: Optional[list] = None,
    output_file: Optional[str] = None,
    src_dirs: Optional[list] = None,
    max_steps: int = 500_000,
):

    user_dirs = [os.path.realpath(d) for d in (src_dirs or [os.getcwd()])]

    debugger: lldb.SBDebugger = lldb.SBDebugger.Create()
    debugger.SetAsync(False)

    print(f"{BOLD}[tracer] target: {exe}{RESET}")
    print(f"{BOLD}[tracer] user source dirs: {user_dirs}{RESET}")

    target: lldb.SBTarget = debugger.CreateTargetWithFileAndArch(
        exe, lldb.LLDB_ARCH_DEFAULT
    )
    if not target or not target.IsValid():
        print(f"{RED}[tracer] ERROR: could not create target for '{exe}'{RESET}")
        return

    bp = target.BreakpointCreateByName("main", target.GetExecutable().GetFilename())
    if bp.GetNumLocations() == 0:
        print(
            f"{RED}[tracer] WARNING: breakpoint on 'main' resolved to 0 locations.{RESET}"
        )
        print(
            f"{RED}[tracer] This usually means the binary has no debug info, or was "
            f"built without -g. Rebuild with `-g -O0` and try again.{RESET}"
        )

    error = lldb.SBError()
    process = target.Launch(
        target.GetDebugger().GetListener(),
        args or None,
        None,
        None,
        None,
        None,
        os.getcwd(),
        0,
        True,
        error,
    )

    if not process or not process.IsValid() or error.Fail():
        print(f"{RED}[tracer] launch error: {error}{RESET}")
        return

    recorder = Recorder(output_file)
    tracer = Tracer(target, user_dirs, recorder, max_steps=max_steps)
    print(f"[tracer] pid={process.GetProcessID()} - stepping...\n")

    # Run to the breakpoint at main.
    process.Continue()

    # Check whether debug info actually resolved lines - catch the
    # "line_entry never valid" case immediately instead of stepping forever.
    checked_debug_info = True

    while True:
        state = process.GetState()

        if state == lldb.eStateExited:
            recorder.emit(
                {
                    "event": "warn",
                    "message": f"process exited (code={process.GetExitStatus()})",
                }
            )
            break
        elif state == lldb.eStateStopped:
            thread = process.GetSelectedThread()
            frame = thread.GetFrameAtIndex(0)

            if not checked_debug_info:
                checked_debug_info = True
                if not frame.GetLineEntry().IsValid():
                    recorder.emit(
                        {
                            "event": "warn",
                            "message": (
                                "stopped at 'main' but line_entry is invalid. The binary likely "
                                "lacks debug symbols (build with -g -O0), or lldb can't locate the "
                                "source. Tracing will show nothing useful."
                            ),
                        }
                    )

            keep_going = tracer.step(process)
            if not keep_going:
                break

            # ── the actual speed fix ──────────────────────────────────────
            # Only ever single-step at *line* granularity, and only while
            # inside user code. The moment we step into non-user code
            # (a library call with no matching source dir), run it to
            # completion with StepOutOfFrame instead of stepping through
            # every instruction of e.g. printf/malloc/libc internals.
            if _is_user_frame(frame, user_dirs):
                thread.StepInto()
            else:
                thread.StepOutOfFrame(frame)
        elif state in (lldb.eStateCrashed, lldb.eStateDetached, lldb.eStateInvalid):
            recorder.emit({"event": "warn", "message": f"unexpected state: {state}"})
            break
        else:
            process.Continue()

    recorder.print()
    recorder.summary()
    recorder.close()

    lldb.SBDebugger.Destroy(debugger)
    lldb.SBDebugger.Terminate()

    print(f"\n[tracer] done. {tracer.total_steps} steps recorded.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLDB variable & call tracer")
    parser.add_argument("--exe", default="./main.o")
    parser.add_argument("--args", nargs="*")
    parser.add_argument("--output", default=None)
    parser.add_argument(
        "--src-dir",
        action="append",
        default=None,
        help="Directory (repeatable) considered 'user code'. "
        "Defaults to cwd. Use this if the tracer prints nothing.",
    )
    parser.add_argument("--max-steps", type=int, default=500_000)
    opts = parser.parse_args()
    try:
        run_trace(opts.exe, opts.args, opts.output, opts.src_dir, opts.max_steps)
    except KeyboardInterrupt:
        pass
