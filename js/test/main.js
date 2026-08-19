// import add from "./util";

class SomeClass {
  rw() {
    a.a();
    // throw new Error("some err");
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
  b++;
  b = 2 * (b + 11);

  "121".replace("1", "2");
  let d = [1, 2, 5].map((x) => c(c(c(x))));
  console.log(d);

  err(b);
}

function err(a) {
  console.info(Error().stack);
  let aa = new SomeClass();
  aa = new SomeClass();
  aa.rw();
}

main();
