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

async function callGemini({ apiKey, model, contents }) {
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
Use these sources as grounding references when relevant: ${SOURCES.join(", ")}
Be concise, accurate, and use Markdown.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.4,
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
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Message is required." }),
      };
    }

    const contents = toContents(history, message);
    const text = await callGemini({ apiKey, model, contents });

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
