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
  let b = 2 * 8;
  // const add_res = add(b, 9);
  b++;
  b++;
  b = 2 * (b + 11);

  if ("1121".replace("1", "2") !== "2121") {
    let d = [1, 2, 5].map((x) => c(c(c(x))));
    console.log(d);
  } else if (1 * 1) {
    err(b);
  } else {
  }
}

function err(a) {
  console.info(Error().stack);
  let aa = new SomeClass();
  aa = new SomeClass();
  aa.rw();
}

main();
