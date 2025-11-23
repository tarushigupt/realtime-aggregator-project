// src/index.ts
import dotenv from "dotenv";
dotenv.config();
import redis from "./cache/redis";
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import tokensRouter from "./routes/token";
import { startPoller } from "./services/poller";
import adminRouter from "./routes/admin";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();
app.use(express.json());

// // health
// app.get("/health", (_req, res) => {
//   res.json({ status: "ok", timestamp: Date.now() });
// });
app.get("/health/redis", async (_req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ redis: pong });
  } catch (err: any) {
    res.status(500).json({ redis: "error", message: err.message });
  }
});

// mount tokens route
app.use("/tokens", tokensRouter);
app.use("/admin", adminRouter);

// create HTTP server and attach socket.io
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // subscribe expects room like "discover:sol" OR just "discover" + ':' + query
  socket.on("subscribe", async (room: string) => {
    try {
      socket.join(room);
      console.log(`${socket.id} joined ${room}`);

      // if this is a discover room, add the query to watched set
      if (room.startsWith("discover:")) {
        const q = room.split(":")[1]?.toLowerCase();
        if (q) {
          try { await redis.sadd("watched:queries", q); }
          catch (e) { console.warn("[socket] failed to add watched query:", e); }
        }
      }
    } catch (e) {
      console.error("subscribe error:", e);
    }
  });

  socket.on("unsubscribe", async (room: string) => {
    try {
      await socket.leave(room);
      console.log(`${socket.id} left ${room}`);

      // if discover room, check room size and remove watched query if empty
      if (room.startsWith("discover:")) {
        const q = room.split(":")[1]?.toLowerCase();
        if (q) {
          const clients = io.sockets.adapter.rooms.get(room);
          const size = clients ? clients.size : 0;
          if (size === 0) {
            try { await redis.srem("watched:queries", q); }
            catch (e) { console.warn("[socket] failed to remove watched query:", e); }
          }
        }
      }
    } catch (e) {
      console.error("unsubscribe error:", e);
    }
  });

  socket.on("disconnecting", async () => {
    // before disconnect, check which rooms the socket will leave
    const rooms = Array.from(socket.rooms); // includes socket.id
    for (const room of rooms) {
      if (room === socket.id) continue;
      if (room.startsWith("discover:")) {
        // after disconnect, room membership reduces by 1 automatically.
        // we can't get the post-disconnect size here reliably, so schedule a short check
        const q = room.split(":")[1]?.toLowerCase();
        if (!q) continue;
        setTimeout(async () => {
          const clients = io.sockets.adapter.rooms.get(room);
          const size = clients ? clients.size : 0;
          if (size === 0) {
            try { await redis.srem("watched:queries", q); }
            catch (e) { console.warn("[socket] failed to remove watched query after disconnect:", e); }
          }
        }, 500); // small delay to let socket.io finalize room removal
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("Client disconnected", socket.id, reason);
  });
});

startPoller(io);
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Tokens: http://localhost:${PORT}/tokens`);
});
