import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Send,
  Sparkles,
  Package,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  Trash2
} from "lucide-react";
import api from "../../lib/api";

function formatINR(val) {
  if (val === undefined || val === null) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(val);
}

const SUGGESTED_QUESTIONS = [
  "Show me products in Electronics",
  "What fitness products do you have?",
  "Show me products under ₹1000",
  "Which products are currently out of stock?",
  "Show me beauty products",
  "What's the most expensive product?",
  "Show me Sports & Fitness items",
  "Which products are in Home & Kitchen?"
];

// Render markdown-style bold text (**text**) without a heavy library
function MarkdownText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MessageText({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => (
        <p key={i} className={line.trim() === "" ? "h-2" : ""}>
          <MarkdownText text={line} />
        </p>
      ))}
    </div>
  );
}

export default function VendorAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "ai",
      text: "Hello! I'm your **ShopSense AI Business Assistant**.\n\nI can help you manage your catalog, check inventory, analyze stock levels, and find products. All information is from your vendor account.\n\nTry one of the suggested questions below, or ask me anything about your business.",
      products: [],
      sources: []
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const chatBottomRef = useRef(null);
  const chatRequestId = useRef(0);

  useEffect(() => {
    api.get("/ai/status")
      .then((res) => setStatus(res.data))
      .catch((err) => {
        setStatus({
          status: "offline",
          vectorStoreReady: false,
          indexedProducts: null,
          provider: "API unavailable"
        });
        setError(
          err.response?.data?.error ||
          "Unable to connect to the ShopSense API. Check that the server is running and try again."
        );
      });
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Build lightweight conversation history from last 4 AI turns (for follow-up context)
  const buildHistory = useCallback((currentMessages) => {
    return currentMessages
      .filter((m) => m.sender === "ai" && m.products && m.products.length > 0)
      .slice(-2)
      .map((m) => ({
        role: "assistant",
        products: m.products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category
        }))
      }));
  }, []);

  const handleSend = async (questionText = input) => {
    const q = String(questionText || "").trim();
    if (!q || loading) return;
    const requestId = ++chatRequestId.current;

    setInput("");
    setError("");

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: q
    };

    setMessages((prev) => {
      const next = [...prev, userMessage];
      return next;
    });

    setLoading(true);

    try {
      // Capture history before adding the new user message
      const history = buildHistory(messages);

      const res = await api.post("/ai/shopping-assistant", {
        question: q,
        conversationHistory: history
      });
      if (requestId !== chatRequestId.current) return;

      const aiMessage = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: res.data.answer,
        provider: res.data.provider,
        products: res.data.products || [],
        sources: res.data.sources || []
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      if (requestId !== chatRequestId.current) return;
      console.error("AI Assistant error:", err);
      const errMsg =
        err.response?.data?.error ||
        (err.response?.status === 401
          ? "Your session has expired. Sign in again to use the AI Assistant."
          : err.message === "Network Error"
            ? "Unable to reach the ShopSense API. Check your connection and confirm the server is running."
            : `The AI Assistant request failed${err.message ? `: ${err.message}` : ". Please try again."}`);
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: "ai",
          text: `⚠️ ${errMsg}`,
          isError: true,
          products: [],
          sources: []
        }
      ]);
    } finally {
      if (requestId === chatRequestId.current) setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    chatRequestId.current += 1;
    setLoading(false);
    setError("");
    setInput("");
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "ai",
        text: "Chat cleared. How can I help you explore the ShopSense catalog today?",
        products: [],
        sources: []
      }
    ]);
  };

  const handleProductClick = (productId) => {
    if (!productId) {
      console.warn("Cannot navigate: Invalid product ID");
      return;
    }
    
    // Navigate to catalog with product query parameter to open the details modal
    navigate(`/vendor/catalog?product=${productId}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-12">

      {/* Header Banner */}
      <header
        className="rounded-2xl p-6 relative overflow-hidden text-white shadow-sm"
        style={{ background: "linear-gradient(135deg, #0E4B44 0%, #15665c 100%)" }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white">
                <Sparkles size={12} className="text-amber-300" />
                {status?.status === "offline"
                  ? "API Unavailable"
                  : status?.indexedProducts === 0
                    ? "Your Catalog Is Empty"
                    : "RAG System Active"}
              </span>
              {status?.indexedProducts !== null && status?.indexedProducts > 0 && (
                <span className="text-[11px] font-semibold text-white/70">
                  {status.indexedProducts.toLocaleString()} products indexed
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">AI Business Assistant</h1>
            <p className="mt-1 text-sm text-white/80 max-w-xl">
              {status?.status === "offline"
                ? "The assistant cannot reach the API right now. Check the connection or server and try again."
                : status?.indexedProducts === 0
                  ? "There are no products in this vendor account to search. Add products to your catalog or sign in to the account that owns them."
                  : "Manage your inventory, analyze products, and get insights about your vendor catalog."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
                <span className={`h-2 w-2 rounded-full ${status.vectorStoreReady ? "bg-emerald-400" : "bg-amber-400"}`} />
                {status.provider || "Local RAG"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Suggested Questions */}
      <div
        className="flex flex-col gap-2.5 p-4 rounded-2xl border"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
          <HelpCircle size={13} className="text-emerald-700" /> Try asking:
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => handleSend(prompt)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-left transition-all border hover:border-emerald-700/50 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 disabled:opacity-50"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink)"
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner (above chat) */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs font-semibold underline"
            onClick={() => setError("")}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Chat Container */}
      <div
        className="rounded-2xl border shadow-sm flex flex-col"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
          height: "min(680px, max(360px, calc(100dvh - 400px)))",
          minHeight: "360px"
        }}
      >
        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
            >
              {/* Avatar + label */}
              <div className="flex items-center gap-2 mb-1.5 text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                {msg.sender === "ai" ? (
                  <>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-white">
                      <Bot size={11} />
                    </span>
                    <span>Business Assistant</span>
                  </>
                ) : (
                  <span>You</span>
                )}
              </div>

              {/* Bubble */}
              <div
                className={`rounded-2xl px-4 py-3.5 sm:px-5 max-w-3xl ${
                  msg.sender === "user"
                    ? "rounded-br-none shadow-sm text-white"
                    : "border rounded-tl-none shadow-sm"
                } ${msg.isError ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""}`}
                style={{
                  background: msg.isError
                    ? undefined
                    : msg.sender === "user"
                    ? "var(--primary)"
                    : "var(--surface)",
                  borderColor:
                    msg.sender === "user" ? "transparent" : msg.isError ? undefined : "var(--border)",
                  color: msg.sender === "user" ? "white" : "var(--ink)"
                }}
              >
                <MessageText text={msg.text} />
                {msg.provider && (
                  <p className="mt-2 text-[10px] font-medium" style={{ color: "var(--ink-soft)" }}>
                    Answer engine: {msg.provider}
                  </p>
                )}

                {/* Product Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
                      <Package size={13} /> Products ({msg.products.length})
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {msg.products.map((p, idx) => {
                        // Determine if this is a live catalog product (numeric ID) or dataset product (string like P001)
                        const isLiveCatalog = p.origin === "live_catalog" || /^\d+$/.test(String(p.id));
                        const isClickable = isLiveCatalog;
                        
                        return (
                          <div
                            key={p.id || idx}
                            onClick={(e) => {
                              if (isClickable) {
                                e.preventDefault();
                                handleProductClick(p.id);
                              }
                            }}
                            className={`rounded-xl p-3 border bg-white dark:bg-black/20 flex gap-3 transition-all ${
                              isClickable 
                                ? "hover:border-emerald-700 hover:shadow-sm cursor-pointer" 
                                : "border-gray-300 opacity-60"
                            }`}
                            style={{ borderColor: isClickable ? "var(--border)" : "#ddd" }}
                          >
                            {/* Product Image */}
                            <div className="shrink-0">
                              <img
                                src={p.imageUrl || "/placeholder.png"}
                                alt={p.name}
                                className="w-20 h-20 object-cover rounded-lg border"
                                style={{ borderColor: "var(--border)" }}
                                onError={(e) => {
                                  e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='1'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
                                }}
                              />
                            </div>

                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              {/* Live Catalog Badge */}
                              {isLiveCatalog && (
                                <div className="mb-2">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 font-semibold">
                                    Your Catalog
                                  </span>
                                </div>
                              )}

                              {/* Name + category */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <span className="font-semibold text-xs leading-snug" style={{ color: "var(--ink)" }}>
                                  {p.name}
                                </span>
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 whitespace-nowrap">
                                  {p.category}
                                </span>
                              </div>

                              {/* Description */}
                              {p.description && (
                                <p className="text-[11px] text-[var(--ink-soft)] line-clamp-2 mb-2.5">
                                  {p.description}
                                </p>
                              )}

                              {/* Vendor badge for dataset products */}
                              {!isLiveCatalog && p.vendor && (
                                <div className="mb-2">
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                    {p.vendor}
                                  </span>
                                </div>
                              )}

                              {/* Price / Stock / Popularity row */}
                              <div className="mt-auto pt-2 border-t border-black/5 grid grid-cols-3 gap-1.5 text-[11px] mb-2">
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-[var(--ink-soft)] block mb-0.5">Price</span>
                                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                                    {formatINR(p.price)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-[var(--ink-soft)] block mb-0.5">Stock</span>
                                  <span className={`font-semibold ${p.stock > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                  {p.stock > 0 ? `${p.stock}` : "Out of stock"}
                                </span>
                              </div>
                              {p.unitsSold > 0 && (
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-[var(--ink-soft)] block mb-0.5 flex items-center gap-0.5">
                                    <TrendingUp size={9} /> Sold
                                  </span>
                                  <span className="font-semibold text-amber-700">
                                    {p.unitsSold.toLocaleString("en-IN")}
                                  </span>
                                </div>
                              )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t flex flex-wrap items-center gap-1.5 text-[11px]" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                    <span className="font-bold flex items-center gap-1" style={{ color: "var(--primary)" }}>
                      <CheckCircle2 size={11} className="text-emerald-700" /> Sources:
                    </span>
                    {msg.sources.map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-black/5 font-mono text-[10px]"
                        title={`ID: ${s.productId} | ${s.category} | ${formatINR(s.price)} | Stock: ${s.stock}`}
                      >
                        {s.productName || s.productId}
                      </span>
                    ))}
                  </div>
                )}

              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {loading && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1.5 text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-white">
                  <Bot size={11} />
                </span>
                <span>ShopSense Assistant</span>
              </div>
              <div
                className="rounded-2xl rounded-tl-none px-4 py-3.5 border shadow-sm flex items-center gap-3 text-sm"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-soft)" }}
              >
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-700 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-700 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-emerald-700 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>Searching catalog &amp; generating grounded response…</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input */}
        <div
          className="sticky bottom-0 z-10 p-3 sm:p-4 border-t"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex sm:gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about products, prices, stock, categories…"
              disabled={loading}
              className="min-w-0 w-full flex-1 rounded-xl px-3 sm:px-4 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-700/30 transition-all"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink)"
              }}
              maxLength={500}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 sm:px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--primary)" }}
            >
              <Send size={15} />
              <span className="hidden sm:inline">Send</span>
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="focus-ring inline-flex min-w-[88px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 py-3 text-sm font-semibold text-white transition-all hover:brightness-95 active:scale-[0.98]"
              style={{ borderColor: "var(--danger)", background: "var(--danger)", color: "#fff" }}
              title="Clear chat history"
              aria-label="Clear chat history"
            >
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--ink-soft)" }}>
            <span>Answers use your catalog data; missing details are called out instead of guessed.</span>
            {status?.status === "offline"
              ? <span>API unavailable</span>
              : status?.indexedProducts === 0
                ? <span>No products in this vendor catalog</span>
                : status?.indexedProducts
              ? <span>{status.indexedProducts.toLocaleString()} items indexed</span>
              : <span>Connecting to catalog…</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
