import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    delay
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";

const PORT = 3000;
const SESSION_PATH = path.join(process.cwd(), "auth_sessions");

if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH);
}

async function startServer() {
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
        },
    });

    const sessions: Record<string, any> = {};

    const logger = pino({ level: "silent" });

    async function connectToWhatsApp(sessionId: string) {
        const { state, saveCreds } = await useMultiFileAuthState(path.join(SESSION_PATH, sessionId));
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: state,
            logger,
            browser: ["ZapMulti", "Chrome", "1.0.0"],
        });

        sessions[sessionId] = { sock, state: "connecting", qr: null, chats: [] };

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                sessions[sessionId].qr = qr;
                sessions[sessionId].state = "qr";
                io.emit("session_update", { sessionId, status: "qr", qr });
            }

            if (connection === "close") {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                sessions[sessionId].state = "disconnected";
                io.emit("session_update", { sessionId, status: "disconnected" });
                
                if (shouldReconnect) {
                    setTimeout(() => connectToWhatsApp(sessionId), 5000);
                } else {
                    delete sessions[sessionId];
                    if (fs.existsSync(path.join(SESSION_PATH, sessionId))) {
                        fs.rmSync(path.join(SESSION_PATH, sessionId), { recursive: true, force: true });
                    }
                    io.emit("session_removed", { sessionId });
                }
            } else if (connection === "open") {
                sessions[sessionId].state = "connected";
                sessions[sessionId].qr = null;
                io.emit("session_update", { sessionId, status: "connected" });
            }
        });

        sock.ev.on("creds.update", saveCreds);

        // Handle history
        sock.ev.on("messaging-history.set", ({ chats: historyChats }) => {
            sessions[sessionId].chats = historyChats.map(c => ({
                id: c.id,
                name: c.name || c.id,
                unreadCount: c.unreadCount || 0
            }));
            io.emit("chats_update", { sessionId, chats: sessions[sessionId].chats });
        });

        sock.ev.on("chats.upsert", (newChats) => {
            for (const c of newChats) {
                const existing = sessions[sessionId].chats.find((ex: any) => ex.id === c.id);
                if (!existing) {
                    sessions[sessionId].chats.push({ id: c.id, name: c.name || c.id, unreadCount: c.unreadCount || 0 });
                }
            }
            io.emit("chats_update", { sessionId, chats: sessions[sessionId].chats });
        });

        sock.ev.on("messages.upsert", async (m) => {
            if (m.type === "notify") {
                for (const msg of m.messages) {
                    // Update last message in chat list
                    const chatId = msg.key.remoteJid;
                    const sessionChats = sessions[sessionId].chats;
                    const chatIndex = sessionChats.findIndex((c: any) => c.id === chatId);
                    
                    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "[Mídia/Outro]";
                    
                    if (chatIndex !== -1) {
                        sessionChats[chatIndex].lastMessage = text;
                        if (!msg.key.fromMe) sessionChats[chatIndex].unreadCount++;
                    } else {
                        sessionChats.push({ id: chatId, name: chatId, lastMessage: text, unreadCount: msg.key.fromMe ? 0 : 1 });
                    }

                    io.emit("chats_update", { sessionId, chats: sessions[sessionId].chats });
                    io.emit("new_message", { sessionId, message: msg });
                }
            }
        });

        return sock;
    }

    // Initialize existing sessions
    const existingSessions = fs.readdirSync(SESSION_PATH);
    for (const sessionId of existingSessions) {
        if (fs.statSync(path.join(SESSION_PATH, sessionId)).isDirectory()) {
            connectToWhatsApp(sessionId);
        }
    }

    // Socket implementation
    io.on("connection", (socket) => {
        console.log("Client connected");
        
        // Send initial state
        const sessionData = Object.keys(sessions).map(id => ({
            id,
            status: sessions[id].state,
            qr: sessions[id].qr
        }));
        socket.emit("init", { sessions: sessionData });

        socket.on("create_session", async ({ sessionId }) => {
            if (sessions[sessionId]) return;
            await connectToWhatsApp(sessionId);
        });

        socket.on("get_chats", ({ sessionId }) => {
            if (sessions[sessionId]) {
                socket.emit("chats_update", { sessionId, chats: sessions[sessionId].chats });
            }
        });

        socket.on("send_message", async ({ sessionId, jid, text }) => {
            const sock = sessions[sessionId]?.sock;
            if (sock) {
                await sock.sendMessage(jid, { text });
            }
        });

        socket.on("logout", async ({ sessionId }) => {
            const sock = sessions[sessionId]?.sock;
            if (sock) {
                await sock.logout();
            }
        });
    });

    // Vite integration
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }

    httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);
