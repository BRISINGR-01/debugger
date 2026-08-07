// expressions.test.js
// A grab-bag of JavaScript expressions for exercising an instrumentation/transform pipeline.
// Covers: arithmetic, logical, bitwise, comparison, assignment, unary, update,
// ternary, sequence, member/optional chaining, calls, new, template literals,
// destructuring, spread, arrow functions, generators, async/await, classes,
// tagged templates, regex, typeof/instanceof/in/void/delete, comma operator, etc.

// ---------- Basic variables ----------
// let a = 5;
let a = 5;
// let b = 10;
let b = 10;
// let c = 0;
let c = 0;
// let obj = { x: 1, y: { z: 2 } };
let obj = { x: 1, y: { z: 2 } };
// let arr = [1, 2, 3, 4, 5];
let arr = [1, 2, 3, 4, 5];
// let flag = true;
let flag = true;
// let str = "hello";
let str = "hello";
// let n = null;
let n = null;
// let u = undefined;
let u = undefined;

// ---------- Arithmetic expressions ----------
// c = a + b;
c = a + b;
// c = a - b;
c = a - b;
// c = a * b;
c = a * b;
// c = a / b;
c = a / b;
// c = a % b;
c = a % b;
// c = a ** b;
c = a ** b;
// c = -a;
c = -a;
// c = +a;
c = +a;
// c = a + b * 2 - ((b / 2) % 3);
c = a + b * 2 - ((b / 2) % 3);

// ---------- Assignment operators ----------
// a += 1;
a += 1;
// a -= 1;
a -= 1;
// a *= 2;
a *= 2;
// a /= 2;
a /= 2;
// a %= 3;
a %= 3;
// a **= 2;
a **= 2;
// a &&= b;
a &&= b;
// a ||= b;
a ||= b;
// a ??= b;
a ??= b;
// a &= b;
a &= b;
// a |= b;
a |= b;
// a ^= b;
a ^= b;
// a <<= 1;
a <<= 1;
// a >>= 1;
a >>= 1;
// a >>>= 1;
a >>>= 1;

// ---------- Update expressions ----------
// a++;
a++;
// a--;
a--;
// ++a;
++a;
// --a;
--a;

// ---------- Comparison expressions ----------
// flag = a > b;
flag = a > b;
// flag = a < b;
flag = a < b;
// flag = a >= b;
flag = a >= b;
// flag = a <= b;
flag = a <= b;
// flag = a == b;
flag = a == b;
// flag = a === b;
flag = a === b;
// flag = a != b;
flag = a != b;
// flag = a !== b;
flag = a !== b;

// ---------- Logical expressions ----------
// flag = a > 0 && b > 0;
flag = a > 0 && b > 0;
// flag = a > 0 || b > 0;
flag = a > 0 || b > 0;
// flag = !flag;
flag = !flag;
// flag = a ?? b;
flag = a ?? b;
// flag = (a > 0 && b > 0) || (a < 0 && b < 0);
flag = (a > 0 && b > 0) || (a < 0 && b < 0);

// ---------- Bitwise expressions ----------
// c = a & b;
c = a & b;
// c = a | b;
c = a | b;
// c = a ^ b;
c = a ^ b;
// c = ~a;
c = ~a;
// c = a << 2;
c = a << 2;
// c = a >> 2;
c = a >> 2;
// c = a >>> 2;
c = a >>> 2;

// ---------- Ternary / conditional ----------
// c = a > b ? a : b;
c = a > b ? a : b;
// c = a > b ? (b > 0 ? 1 : -1) : 0;
c = a > b ? (b > 0 ? 1 : -1) : 0;

// ---------- Sequence (comma) expression ----------
// c = ((a += 1), (b += 1), a + b);
c = ((a += 1), (b += 1), a + b);

// ---------- typeof / instanceof / in / void / delete ----------
// flag = typeof a === "number";
flag = typeof a === "number";
// flag = obj instanceof Object;
flag = obj instanceof Object;
// flag = "x" in obj;
flag = "x" in obj;
// void 0;
void 0;
// delete obj.x;
delete obj.x;

// ---------- Member expressions ----------
// c = obj.y.z;
c = obj.y.z;
// c = arr[0];
c = arr[0];
// c = arr[arr.length - 1];
c = arr[arr.length - 1];
// c = obj?.y?.z;
c = obj?.y?.z;
// c = obj?.missing?.deep ?? "default";
c = obj?.missing?.deep ?? "default";
// c = arr?.[10];
c = arr?.[10];

// ---------- Function calls ----------
// function add(x, y) {
//   return x + y;
// }
function add(x, y) {
  return x + y;
}
// c = add(a, b);
c = add(a, b);
// c = add(a, add(b, c));
c = add(a, add(b, c));
// c = Math.max(a, b, c);
c = Math.max(a, b, c);
// c = obj?.y?.z?.toString?.();
c = obj?.y?.z?.toString?.();

// ---------- new expressions ----------
class Point {
  constructor(x, y) {
    // this.x = x;
    this.x = x;
    // this.y = y;
    this.y = y;
  }
  get magnitude() {
    // return Math.sqrt(this.x ** 2 + this.y ** 2);
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }
  set magnitude(m) {
    // this.x = m;
    this.x = m;
  }
  distanceTo(other) {
    // return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }
}
// let p1 = new Point(0, 0);
let p1 = new Point(0, 0);
// let p2 = new Point(3, 4);
let p2 = new Point(3, 4);
// c = p1.distanceTo(p2);
c = p1.distanceTo(p2);
// p1.x = 10;
p1.x = 10;
// p1["y"] = 20;
p1["y"] = 20;
// c = p1.magnitude;
c = p1.magnitude;
// p1.magnitude = 5;
p1.magnitude = 5;

// ---------- Arrow functions & closures ----------
// const square = (x) => x * x;
const square = (x) => x * x;
// const sum = (x, y) => {
//   return x + y;
// };
const sum = (x, y) => {
  return x + y;
};
// const makeCounter = () => {
//   let count = 0;
//   return () => ++count;
// };
const makeCounter = () => {
  let count = 0;
  return () => ++count;
};
// const counter = makeCounter();
const counter = makeCounter();
// c = counter();
c = counter();
// c = square(a) + sum(a, b);
c = square(a) + sum(a, b);

// ---------- Template literals & tagged templates ----------
// let name = "world";
let name = "world";
// let greeting = `Hello, ${name}! Sum is ${a + b}.`;
let greeting = `Hello, ${name}! Sum is ${a + b}.`;
// function tag(strings, ...values) {
//   return strings.raw.join("|") + values.join(",");
// }
function tag(strings, ...values) {
  return strings.raw.join("|") + values.join(",");
}
// let tagged = tag`a=${a} b=${b}`;
let tagged = tag`a=${a} b=${b}`;

// ---------- Array/object literals with spread ----------
// let arr2 = [...arr, 6, 7];
let arr2 = [...arr, 6, 7];
// let obj2 = { ...obj, w: 4 };
let obj2 = { ...obj, w: 4 };
// c = Math.max(...arr);
c = Math.max(...arr);

// ---------- Destructuring assignment expressions ----------
// let { x: destructX, y: { z: destructZ } = {} } = obj;
let { x: destructX, y: { z: destructZ } = {} } = obj;
// let [first, second, ...rest] = arr;
let [first, second, ...rest] = arr;
// [a, b] = [b, a];
[a, b] = [b, a];

// ---------- Optional chaining with calls ----------
// let maybeFn = null;
let maybeFn = null;
// c = maybeFn?.(a, b) ?? "no-op";
c = maybeFn?.(a, b) ?? "no-op";

// ---------- Regex literal ----------
// let re = /\d+(\.\d+)?/g;
let re = /\d+(\.\d+)?/g;
// flag = re.test(str);
flag = re.test(str);

// ---------- Generators ----------
// function* gen() {
//   yield 1;
//   yield 2;
//   const val = yield 3;
//   return val;
// }
function* gen() {
  yield 1;
  yield 2;
  const val = yield 3;
  return val;
}
// let it = gen();
let it = gen();
// c = it.next().value;
c = it.next().value;

// ---------- Async / await ----------
// async function fetchValue() {
//   const result = await Promise.resolve(42);
//   return result + 1;
// }
async function fetchValue() {
  const result = await Promise.resolve(42);
  return result + 1;
}
// fetchValue().then((v) => (c = v));
fetchValue().then((v) => (c = v));

// ---------- IIFE ----------
// c = (function () {
//   return a * b;
// })();
c = (function () {
  return a * b;
})();
// c = (() => a - b)();
c = (() => a - b)();

// ---------- Complex nested expression ----------
// c =
//   ((a + b) * (c - 1)) / (Math.abs(a - b) || 1) +
//   (flag ? arr[0] : arr[arr.length - 1]) -
//   (obj?.y?.z ?? 0);
c =
  ((a + b) * (c - 1)) / (Math.abs(a - b) || 1) +
  (flag ? arr[0] : arr[arr.length - 1]) -
  (obj?.y?.z ?? 0);

// ---------- this expression inside a method ----------
// const thisObj = {
//   val: 100,
//   getVal() {
//     return this.val;
//   },
//   bumpVal() {
//     this.val += 1;
//     return this.val;
//   },
// };
const thisObj = {
  val: 100,
  getVal() {
    return this.val;
  },
  bumpVal() {
    this.val += 1;
    return this.val;
  },
};
// thisObj.bumpVal();
thisObj.bumpVal();

// ---------- Chained assignment ----------
// let m, k;
let m, k;
// m = k = a + b;
m = k = a + b;

// ---------- Exponentiation chains ----------
// c = 2 ** (3 ** 2);
c = 2 ** (3 ** 2);

// ---------- Mixed boolean short-circuit with side effects ----------
// function sideEffect(label) {
//   return label;
// }
function sideEffect(label) {
  return label;
}
// flag = sideEffect("left") && sideEffect("right");
flag = sideEffect("left") && sideEffect("right");
// flag = sideEffect("left") || sideEffect("right");
flag = sideEffect("left") || sideEffect("right");
