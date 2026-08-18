import express from "express";
import { WebSocketServer } from "ws";
import { broadcastLog, clear, isDev, listen } from "./utils.js";
import fs from "fs";

const app = express();
const data = [];

app.use(express.json());
app.use(express.static(new URL("../ui/dist/", import.meta.url).pathname));

app.get("/", (req, res) =>
  res.sendFile(new URL("../ui/dist/index.html", import.meta.url).pathname),
);
app.use("/is-debug", (req, res) => res.json(true));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.delete("/clear", (req, res) => {
  clear(data);
  return res.json({ status: "success" });
});

app.post("/log", (req, res) => {
  const logEntry = req.body;
  // console.log(logEntry);

  if (!logEntry || Object.keys(logEntry).length === 0) {
    return res
      .status(400)
      .json({ error: "Missing or empty JSON body structure" });
  }

  broadcastLog(JSON.stringify(logEntry), data);
  return res.json({ status: "success" });
});

export async function startServer(port = 5634) {
  console.log(1);

  let server;
  for (let i = 0; i < 100; i++) {
    console.log(`Trying to start the debug server on port ${++port}`);

    try {
      server = await listen(port, app);
      if (server) {
        console.log(`Server/UI is hosted on http://localhost:${port}`);
        break;
      }
    } catch (error) {
      if (error === "Server is already running") {
        console.log("Server is already running");
        return port;
      } else {
        console.error(`Port ${port} already in use`);
      }
    }
  }

  if (!server) throw new Error("Could not find an empty port");

  if (isDev()) {
    data = fs
      .readFileSync(new URL("./dev-log.txt", import.meta.url).href)
      .toJSON();
  }

  new WebSocketServer({ server }).on("connection", (ws) => {
    if (ws.readyState !== 1) return;

    for (const d of data) {
      ws.send(d);
    }
  });

  return port;
}

if (process.argv[2] === "solo") {
  startServer();
}
