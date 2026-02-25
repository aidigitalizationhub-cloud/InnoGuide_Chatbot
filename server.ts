import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const SOURCES = [
  "https://rid.ug.edu.gh/news",
  "https://orid1.ug.edu.gh/news/",
  "https://nmimr.ug.edu.gh/",
  "https://www.waccbip.org/news",
  "https://biotech.ug.edu.gh/",
  "https://dig.ug.edu.gh/",
  "https://www.iast.ug.edu.gh/",
  "https://www.ug.edu.gh/academics/centres-institutes",
  "https://ugms.ug.edu.gh/",
  "https://ugmedicalcentre.org/",
  "https://chs.ug.edu.gh/",
  "https://pharmacy.ug.edu.gh/",
  "https://sbahs.ug.edu.gh/",
  "https://www.ug.edu.gh/academics/departments",
  "https://www.ug.edu.gh/research/research-centres",
  "https://www.ug.edu.gh/academics/colleges",
  "https://www.ug.edu.gh/news-events",
  "https://rips.ug.edu.gh/",
  "https://isser.ug.edu.gh/",
  "https://www.ug.edu.gh/about-ug/overview",
];

function getApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : "";
}

function toGeminiContents(history: any[], message: string) {
  const safeHistory = Array.isArray(history) ? history : [];
  const contents = safeHistory
    .filter((msg) => msg?.content && typeof msg.content === "string")
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const history = Array.isArray(req.body?.history) ? req.body.history : [];

      if (!message) {
        return res.status(400).json({ error: "Message is required." });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(401).json({
          error: "Missing GEMINI_API_KEY. Add it to .env for local dev.",
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const contents = toGeminiContents(history, message);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.flushHeaders();

      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: `You are InnoGuide, an expert assistant for the University of Ghana and the IAST Virtual Innovation Hub.
If useful, you may use urlContext with these sources: ${SOURCES.join(", ")}
Be concise, accurate, and use Markdown.`,
          tools: [{ urlContext: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ t: text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      const errorMessage = error?.message || "Internal Server Error";
      console.error("Chat API error:", errorMessage);

      if (res.headersSent && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
        return;
      }

      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        return res.status(401).json({ error: "Invalid Gemini API key." });
      }

      res.status(500).json({ error: errorMessage });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on("error", (error: any) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Stop the other process or set PORT to a free port.`);
      process.exit(1);
    }
    throw error;
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
