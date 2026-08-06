import express from "express";
import path from "path";
import { WebSocketServer } from "ws";

const PORT = 8000;

const app = express();
const data = [];

app.use(express.json());
app.use(express.static(new URL("../ui/dist/", import.meta.url).pathname));

app.get("/", (req, res) => {
  res.sendFile(new URL("../ui/dist/index.html", import.meta.url).pathname);
});
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const server = app.listen(PORT, () =>
  console.log(`UI is hosted on http://127.0.0.1:${PORT}`),
);

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  if (ws.readyState !== 1) return;

  for (const d of data) {
    ws.send(d);
  }
});

function broadcastLog(logString) {
  try {
    // Basic verification that the incoming log line is clean JSON
    JSON.parse(logString);

    data.push(logString);
    wss.clients.forEach((client) => {
      // 1 === WebSocket.OPEN
      if (client.readyState === 1) {
        client.send(logString);
      }
    });
  } catch (err) {
    console.warn(err);
  }
}

app.delete("/clear", (req, res) => {
  clear();
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

  broadcastLog(JSON.stringify(logEntry));
  return res.json({ status: "success" });
});

function clear() {
  data.length = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 === WebSocket.OPEN
      client.send("clear");
    }
  });
}
