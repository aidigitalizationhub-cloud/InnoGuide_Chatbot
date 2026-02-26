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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "for",
  "from",
  "have",
  "into",
  "more",
  "that",
  "than",
  "their",
  "them",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function toContents(history, message) {
  const safeHistory = Array.isArray(history) ? history : [];
  const contents = safeHistory
    .filter((msg) => msg && typeof msg.content === "string" && msg.content.trim())
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

function extractKeywords(message) {
  return [...new Set(
    String(message)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  )].slice(0, 8);
}

function scoreSource(url, keywords) {
  const haystack = url.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (!keyword) return score;
    if (haystack.includes(keyword)) return score + 2;
    return score;
  }, 0);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSourceSnippet(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "InnoGuideBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || url;
    const text = stripHtml(html).slice(0, 1800);
    if (!text) return null;
    return { url, title, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildLiveContext(message) {
  const keywords = extractKeywords(message);
  const ranked = SOURCES
    .map((url) => ({ url, score: scoreSource(url, keywords) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);

  const shortlist = [...new Set([
    ...ranked.slice(0, 4),
    "https://www.iast.ug.edu.gh/",
    "https://www.ug.edu.gh/news-events",
  ])].slice(0, 5);

  const snippets = (await Promise.all(shortlist.map((url) => fetchSourceSnippet(url))))
    .filter(Boolean);

  if (!snippets.length) {
    return "No live source snippets were available for this query.";
  }

  return snippets
    .map((snippet, idx) => {
      return `${idx + 1}. ${snippet.title}\nURL: ${snippet.url}\nExcerpt: ${snippet.text}`;
    })
    .join("\n\n");
}

async function callGemini({ apiKey, model, contents, liveContext }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [
          {
            text: `You are InnoGuide, an expert assistant for the University of Ghana and the IAST Virtual Innovation Hub.
Use these approved sources as grounding references: ${SOURCES.join(", ")}

Live context for this request:
${liveContext}

Response rules:
1) Give a detailed, accurate answer with clear sections and bullet points.
2) Prioritize facts from the live context. If a fact is uncertain, state that explicitly.
3) End with a "Sources" section listing URLs you relied on.
4) If the question asks for steps/processes, provide step-by-step guidance.
5) Do not invent UG programs, offices, names, or dates.
6) Use Markdown.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 1200,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || "")
    .join("")
    .trim();

  return text || "";
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing GEMINI_API_KEY in Netlify environment variables." }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (!message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Message is required." }),
      };
    }

    const contents = toContents(history, message);
    const liveContext = await buildLiveContext(message);
    const text = await callGemini({ apiKey, model, contents, liveContext });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error?.message || "Internal Server Error",
      }),
    };
  }
};
