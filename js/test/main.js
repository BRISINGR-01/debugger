// import add from "./util";

class SomeClass {
  rw() {
    throw 10;
  }
}

function c(s) {
  const e = s * 2;
  return (s + 1) * e;
}

function main() {
  let b = 9;
  // const add_res = add(b, 9);
  b++;
  err(b);
  b = 11;

  let d = [1, 4, 6].map((x) => c(c(c(x))));
}

function err(a) {
  Error().stack;
  let aa = new SomeClass();
  aa = new SomeClass();
  aa.rw();
}

main();
js2();
