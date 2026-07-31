import express from "express";
import { WebSocketServer } from "ws";
import fs from "node:fs";
import path from "node:path";

const PORT = 8000;
const LOG_FILE_PATH = path.resolve("../../cpp/test/.trace/log");

const app = express();
const data = [];

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`   -> WS Pipeline:  ws://127.0.0.1:${PORT}`);
  console.log(`   -> HTTP Ingest:  POST http://127.0.0.1:${PORT}/log`);
});

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

app.delete("/clear", clear);

app.post("/log", (req, res) => {
  const logEntry = req.body;
  console.log(logEntry);

  if (!logEntry || Object.keys(logEntry).length === 0) {
    return res
      .status(400)
      .json({ error: "Missing or empty JSON body structure" });
  }

  broadcastLog(JSON.stringify(logEntry));
  return res.json({ status: "success" });
});

function startFileWatcher() {
  console.log(`Actively monitoring file targets: ${LOG_FILE_PATH}`);

  // Create empty placeholder log text file if missing to prevent boot crashes
  if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error("File doesn't exist");
    process.exit(1);
  }

  let currentFileSize = fs.statSync(LOG_FILE_PATH).size;
  const lines = fs.readFileSync(LOG_FILE_PATH).toString().split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    broadcastLog(line);
  }

  // Track changes on disk at efficient 100ms interval checkpoints
  fs.watchFile(LOG_FILE_PATH, { interval: 100 }, (curr) => {
    // If file shrunk or truncated, reset cursor to 0 to prevent index errors
    if (curr.size <= currentFileSize) {
      currentFileSize = curr.size;
      clear();
      return;
    }

    const stream = fs.createReadStream(LOG_FILE_PATH, {
      start: currentFileSize,
      end: curr.size - 1,
      encoding: "utf-8",
    });

    let freshChunkBuffer = "";
    stream.on("data", (chunk) => {
      freshChunkBuffer += chunk;
    });
    stream.on("end", () => {
      const lines = freshChunkBuffer.split("\n");

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        broadcastLog(line);
      }
    });

    currentFileSize = curr.size;
  });
}

function clear() {
  data.length = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 === WebSocket.OPEN
      client.send("clear");
    }
  });
}

// Fire up the file system monitoring engine alongside the listening routes
startFileWatcher();
