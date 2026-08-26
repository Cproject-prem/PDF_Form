require("dotenv").config();
const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 8002;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let isReady = false;

client.on("qr", (qr) => {
    console.log("Scan this QR code with your WhatsApp app:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("WhatsApp Client is ready!");
    isReady = true;
});

client.on("disconnected", (reason) => {
    console.log("WhatsApp Client disconnected:", reason);
    isReady = false;
});

client.initialize();

// API Endpoint to send message
app.post("/send", async (req, res) => {
    if (!isReady) {
        return res.status(503).json({ error: "WhatsApp client is not ready yet." });
    }

    const { to, message, pdf_name, pdf_base64 } = req.body;

    if (!to) {
        return res.status(400).json({ error: "Missing 'to' parameter (group name or phone number)" });
    }

    try {
        const chats = await client.getChats();
        
        // 1. Try to find a chat (group or contact) exactly matching the 'to' name
        let targetChat = chats.find(c => c.name === to);

        // 2. If not found, try to format as phone number
        if (!targetChat) {
            let number = to.replace(/[^0-9]/g, "");
            if (number) {
                const chatId = `${number}@c.us`;
                targetChat = await client.getChatById(chatId).catch(() => null);
            }
        }

        if (!targetChat) {
            return res.status(404).json({ error: `Could not find group or contact matching '${to}'` });
        }

        let media = undefined;
        if (pdf_base64) {
            media = new MessageMedia("application/pdf", pdf_base64, pdf_name || "document.pdf");
        }

        const response = await targetChat.sendMessage(message || "", { media });
        
        res.json({ success: true, messageId: response.id._serialized });
    } catch (err) {
        console.error("Error sending message:", err);
        res.status(500).json({ error: err.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`WhatsApp API Server running on http://localhost:${PORT}`);
});
