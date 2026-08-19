import { EventEmitter } from "events";
import express from "express";
import { WebSocketServer } from "ws";

export default class HTTPServer extends EventEmitter {
  #wss;
  #server;
  #port;
  data;

  constructor(data, port) {
    super();
    this.data = data;
    this.#port = port;
  }

  broadcast(logString) {
    const parsed = JSON.parse(logString);
    this.data.push(parsed);
    this.emit("data", parsed);

    for (const client of this.#wss?.clients ?? []) {
      if (client.readyState === 1) client.send(logString);
    }
  }

  clear() {
    this.data.length = 0;
    this.emit("clear");
    for (const client of this.#wss?.clients ?? []) {
      if (client.readyState === 1) client.send("clear");
    }
  }

  async start() {
    const app = this.#createApp();
    this.#server = await this.#findPort(app);
    this.#wss = new WebSocketServer({ server: this.#server });

    this.emit("ready");

    this.#wss.on("connection", (ws) => {
      if (ws.readyState !== 1) return;
      for (const d of this.data) {
        ws.send(d);
      }
    });
  }

  async stop() {
    if (this.#wss) {
      this.#wss.close();
      this.#wss = null;
    }
    if (this.#server) {
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
    }
  }

  #createApp() {
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });

    app.get("/is-debug", (_req, res) => res.json(true));

    app.delete("/clear", (_req, res) => {
      this.clear();
      return res.json({ status: "success" });
    });

    app.post("/log", (req, res) => {
      const entry = req.body;
      if (!entry || Object.keys(entry).length === 0) {
        return res.status(400).json({ error: "Missing or empty JSON body" });
      }
      try {
        this.broadcast(JSON.stringify(entry));
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
      return res.json({ status: "success" });
    });

    return app;
  }

  async #findPort(app) {
    let port = this.#port;
    for (let i = 0; i < 100; i++) {
      try {
        const server = await new Promise((resolve, reject) => {
          const s = app.listen(port++);
          s.on("listening", () => resolve(s));
          s.on("error", (err) => {
            s.close();
            reject(err);
          });
        });
        console.log(`[debugger] server on http://localhost:${port}`);
        return server;
      } catch (err) {
        if (err.code !== "EADDRINUSE") throw err;
      }
    }
    throw new Error("Could not find an open port");
  }
}
