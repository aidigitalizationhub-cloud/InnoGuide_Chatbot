/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Markdown from "react-markdown";
import { Bot, ChevronRight, Globe, Info, Loader2, Menu, Send, Sparkles, User, X } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const CHAT_ENDPOINT = `${API_BASE_URL}/api/chat`;

const starterPrompts = [
  "What's the latest news from RID?",
  "Tell me about the Noguchi Medical Research Institute.",
  "How does the IAST Virtual Innovation Hub support students?",
  "List some research centers at UG.",
];

function appendTextToMessage(messageId: string, text: string, setMessages: React.Dispatch<React.SetStateAction<Message[]>>) {
  setMessages((prev) =>
    prev.map((msg) => (msg.id === messageId ? { ...msg, content: `${msg.content}${text}` } : msg)),
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent, text?: string) => {
    e?.preventDefault();
    const outbound = (text ?? input).trim();

    if (!outbound || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: outbound,
      timestamp: new Date(),
    };

    const assistantMessageId = `${Date.now()}-assistant`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outbound,
          history: messages.map((msg) => ({ role: msg.role, content: msg.content })),
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to get response";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await response.json();
        const textFromJson = data?.text || data?.t || "";
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: textFromJson } : msg)),
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body found.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) {
            continue;
          }

          const data = dataLine.slice(6).trim();
          if (data === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.t) {
              appendTextToMessage(assistantMessageId, parsed.t, setMessages);
            } else if (parsed.text) {
              appendTextToMessage(assistantMessageId, parsed.text, setMessages);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseError) {
            console.error("Error parsing stream chunk:", parseError);
          }
        }
      }
    } catch (error: any) {
      const message = error?.message || "Unexpected error";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: `I'm sorry, I encountered an error: ${message}. Please try again later.` }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 bg-white border-r border-slate-200 flex flex-col z-20"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h1 className="font-bold text-lg tracking-tight">InnoGuide</h1>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-slate-100 rounded-md lg:hidden">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                  Virtual Innovation Hub
                </h2>
                <div className="space-y-1">
                  <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <Info className="w-4 h-4" />
                    IAST Hub Overview
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
                  Active Sources ({SOURCES.length})
                </h2>
                <div className="space-y-1">
                  {SOURCES.map((source, idx) => (
                    <a
                      key={idx}
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-xs text-slate-600 transition-colors group"
                    >
                      <Globe className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
                      <span className="truncate">{source.replace("https://", "")}</span>
                      <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ))}
                </div>
              </section>
            </div>

            <div className="p-4 border-t border-slate-100">
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">Powered by Gemini and curated UG sources.</div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-6 sticky top-0 z-10">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <div className="flex flex-col">
            <h2 className="font-semibold text-slate-800">University of Ghana Assistant</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Live Context Active</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
                <Bot className="w-8 h-8 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Welcome to UG InnoGuide</h3>
                <p className="text-slate-500 leading-relaxed">
                  I'm your assistant for the University of Ghana and the IAST Virtual Innovation Hub. Ask about UG units,
                  innovation opportunities, and research information.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 w-full">
                {starterPrompts.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => void handleSend(undefined, suggestion)}
                    className="p-3 text-sm text-left bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-slate-700 font-medium"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={message.id}
              className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                  message.role === "user" ? "bg-slate-800" : "bg-indigo-600"
                }`}
              >
                {message.role === "user" ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className="max-w-[80%] space-y-1">
                <div
                  className={`p-4 rounded-2xl ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-white border border-slate-200 shadow-sm rounded-tl-none"
                  }`}
                >
                  <div className={`prose prose-sm max-w-none ${message.role === "user" ? "prose-invert" : "text-slate-700"}`}>
                    <Markdown>{message.content}</Markdown>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 px-1">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                <span className="text-sm text-slate-500 font-medium">Generating answer...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-6 bg-white border-t border-slate-200">
          <form onSubmit={(e) => void handleSend(e)} className="max-w-4xl mx-auto relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about UG research, news, or the Innovation Hub..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-semibold">
            University of Ghana • Institute of Applied Science and Technology
          </p>
        </div>
      </main>
    </div>
  );
}
