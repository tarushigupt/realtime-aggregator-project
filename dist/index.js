"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const redis_1 = __importDefault(require("./cache/redis"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const token_1 = __importDefault(require("./routes/token"));
const poller_1 = require("./services/poller");
const admin_1 = __importDefault(require("./routes/admin"));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = (0, express_1.default)();
app.use(express_1.default.json());
// // health
// app.get("/health", (_req, res) => {
//   res.json({ status: "ok", timestamp: Date.now() });
// });
app.get("/health/redis", async (_req, res) => {
    try {
        const pong = await redis_1.default.ping();
        res.json({ redis: pong });
    }
    catch (err) {
        res.status(500).json({ redis: "error", message: err.message });
    }
});
// mount tokens route
app.use("/tokens", token_1.default);
app.use("/admin", admin_1.default);
// create HTTP server and attach socket.io
const httpServer = http_1.default.createServer(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    // subscribe expects room like "discover:sol" OR just "discover" + ':' + query
    socket.on("subscribe", async (room) => {
        try {
            socket.join(room);
            console.log(`${socket.id} joined ${room}`);
            // if this is a discover room, add the query to watched set
            if (room.startsWith("discover:")) {
                const q = room.split(":")[1]?.toLowerCase();
                if (q) {
                    try {
                        await redis_1.default.sadd("watched:queries", q);
                    }
                    catch (e) {
                        console.warn("[socket] failed to add watched query:", e);
                    }
                }
            }
        }
        catch (e) {
            console.error("subscribe error:", e);
        }
    });
    socket.on("unsubscribe", async (room) => {
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
                        try {
                            await redis_1.default.srem("watched:queries", q);
                        }
                        catch (e) {
                            console.warn("[socket] failed to remove watched query:", e);
                        }
                    }
                }
            }
        }
        catch (e) {
            console.error("unsubscribe error:", e);
        }
    });
    socket.on("disconnecting", async () => {
        // before disconnect, check which rooms the socket will leave
        const rooms = Array.from(socket.rooms); // includes socket.id
        for (const room of rooms) {
            if (room === socket.id)
                continue;
            if (room.startsWith("discover:")) {
                // after disconnect, room membership reduces by 1 automatically.
                // we can't get the post-disconnect size here reliably, so schedule a short check
                const q = room.split(":")[1]?.toLowerCase();
                if (!q)
                    continue;
                setTimeout(async () => {
                    const clients = io.sockets.adapter.rooms.get(room);
                    const size = clients ? clients.size : 0;
                    if (size === 0) {
                        try {
                            await redis_1.default.srem("watched:queries", q);
                        }
                        catch (e) {
                            console.warn("[socket] failed to remove watched query after disconnect:", e);
                        }
                    }
                }, 500); // small delay to let socket.io finalize room removal
            }
        }
    });
    socket.on("disconnect", (reason) => {
        console.log("Client disconnected", socket.id, reason);
    });
});
(0, poller_1.startPoller)(io);
httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Tokens: http://localhost:${PORT}/tokens`);
});
