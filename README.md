# Universal Trace Debugger

A language-agnostic execution recorder that instruments source code, records execution as a stream of events, and allows replay through a VSCode extension or web UI.

The goal is to provide the same debugging experience regardless of programming language.

---

# High-Level Architecture

```
User Command
      │
      ▼
debugger <command>
      │
      ▼
Instrumentation
      │
      ▼
Instrumented Project (.debug)
      │
      ▼
Application Runtime
      │
      ▼
Recorder Runtime
      │
      ▼
Trace Output
(file / socket / server)
      │
      ▼
VSCode Extension / Web UI
```

The original project is never modified.

The debugger creates a temporary `.debug` workspace, symlinks unchanged files, instruments supported source files, then runs the original command from inside the new workspace.

---

# Repository Layout

```
cpp/
    C++ instrumentation

js/
    JavaScript/TypeScript instrumentation

debugger/
    launcher
    trace server
    web ui

vs-code-extension/
    trace viewer

json-spec.ts
    shared event definitions
```

Every language backend produces the same trace format.

---

# Instrumentation Rules

Instrumentation must never change program behavior.

It must preserve:

* execution order
* evaluation order
* return values
* exceptions
* side effects
* lazy evaluation
* short-circuit operators
* async behavior

Instrumentation should only insert recorder calls.

---

# Trace Model

Execution is represented as a chronological stream of events.

Every event contains:

```ts
{
    event: string
    time: number
    fn_id: string
    loc: string
}
```

Additional fields depend on the event type.

Unknown fields should be ignored by viewers.

---

# Core Events

## Function

* call
* enter
* exit
* throw

Example

```
call foo
enter foo
exit foo
```

---

## Variables

### declare

Variable becomes visible.

```
let x = 5
```

### change

Variable value changes.

```
x++
```

---

## Control Flow

Branch decisions should be recorded.

```
if
else
switch
case
ternary
```

Example

```
if (x > 5)

↓

branch
condition: x > 5
result: true
taken: then
```

---

## Loops

Loop execution should record:

* loop enter
* each iteration
* loop exit

---

## Exceptions

Supported events:

* try-enter
* catch-enter
* finally-enter
* throw
* rethrow

---

## Expressions

Expression values are first-class trace events.

Example

```cpp
a + b * c
```

may produce

```
expression
text: b * c
value: 8

expression
text: a + (b * c)
value: 11
```

This enables hovering any expression and seeing exactly what it evaluated to.

---

# Event Ordering

Events should follow execution exactly.

Example

```cpp
foo(bar())
```

Trace

```
call bar
enter bar
exit bar

call foo
enter foo
exit foo
```

---

# Value Representation

Recorded values should be serialized into a language-independent format.

Examples:

* number
* string
* boolean
* object
* array
* map
* set
* null
* undefined

Objects should support configurable serialization depth.

---

# Trace Outputs

The recorder should support multiple output targets:

* local trace file
* socket
* debugger server
* stdout (development)

The recorder should not depend on a specific transport.

---

# Supported Frontends

* VSCode Extension
* Web UI
* CLI tools

All viewers consume the same trace format.

---

# Future Events

The following events are recommended but optional:

* module-load
* module-unload
* thread-start
* thread-end
* await
* resume
* variable-destroy
* object-create
* object-destroy
* allocation
* deallocation

---

# Philosophy

The project is language-independent.

Each language implementation is responsible only for transforming source code into recorder calls.

Everything after event generation—storage, replay, visualization, and debugging—is shared across all languages.
