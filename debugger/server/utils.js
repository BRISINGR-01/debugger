export function clear(data) {
  data.length = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 1 === WebSocket.OPEN
      client.send("clear");
    }
  });
}

export async function isServerRunningOnPort(port) {
  try {
    const res = await fetch(`http://localhost:${port}/is-debug`);
    const text = await res.text();
    if (text === "true") return true;
  } catch {}
}

export function broadcastLog(logString, data) {
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

export async function listen(port, app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.on("listening", () => resolve(server));
    server.on("error", async (error) => {
      if (error.code !== "EADDRINUSE") return reject(error);

      if (await isServerRunningOnPort(port))
        return reject("Server is already running");

      server.close();
      reject(null);
    });
  });
}

export function isDev() {
  return process.env.DEV;
}
