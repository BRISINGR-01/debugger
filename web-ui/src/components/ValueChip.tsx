export function ValueChip({ value }: { value: string }) {
  if (value === null || value === undefined) {
    return <span className="te-chip te-chip-null">null</span>;
  }
  const isStruct = typeof value === "string" && value.startsWith("{");
  const isPtr = typeof value === "string" && value.startsWith("0x");
  return (
    <span
      className={`te-chip ${isStruct ? "te-chip-struct" : isPtr ? "te-chip-ptr" : "te-chip-val"}`}
    >
      {value}
    </span>
  );
}
