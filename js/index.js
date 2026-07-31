import instrumentFile from "./instrument.js";
import prepareDest from "./prepareDest.js";

const action = process.argv[2];
const args = process.argv.slice(3);
switch (action) {
  case "prepareDest":
    prepareDest(...args);
    break;
  case "instrument":
    instrumentFile(...args);
    break;
  default:
    console.error("You have to provide a viable action");
    process.exit(1);
}
