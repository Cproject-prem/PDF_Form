import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Bot, Send, X, Sparkles, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AiChatbotWidget() {
  const { user, branding } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  const botName = branding?.ai_bot_name || "FormForge AI";
  const botLogo = branding?.ai_bot_logo_url ? (
    branding.ai_bot_logo_url.startsWith("http")
      ? branding.ai_bot_logo_url
      : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_logo_url}`
  ) : null;
  const botGif = branding?.ai_bot_gif_url ? (
    branding.ai_bot_gif_url.startsWith("http")
      ? branding.ai_bot_gif_url
      : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.ai_bot_gif_url}`
  ) : null;

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: `Hello ${user?.name ? user.name.split(" ")[0] : ""}! I am ${botName}. Ask me anything about solar plant manuals, SOPs, or form workflows!`
      }
    ]);
  }, [botName, user]);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  if (branding?.enable_ai === false) return null;

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || isTyping) return;

    const userMsg = { role: "user", content: inputMsg.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMsg("");
    setIsTyping(true);

    try {
      const res = await api.post("/ai/chat", { messages: newMessages, provider: "local" });
      setMessages([...newMessages, { role: "assistant", content: res.data.reply }]);
    } catch (err) {
      toast.error(err.message || "Failed to communicate with AI Assistant");
      setMessages([...newMessages, { role: "assistant", content: "Sorry, I am having trouble connecting to the local Ollama LLM runtime right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `Chat history cleared. How can ${botName} help you now?`
      }
    ]);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Floating Chat Drawer Window */}
      {isOpen && (
        <div className="w-80 sm:w-96 h-[480px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden mb-3 transition-all animate-in slide-in-from-bottom-5 duration-200">
          {/* Header with AI Logo & Chatbot GIF */}
          <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                {botGif ? (
                  <img
                    src={botGif}
                    alt={botName}
                    className="w-8 h-8 rounded-xl object-cover border border-indigo-400/60 shadow-sm"
                  />
                ) : botLogo ? (
                  <img
                    src={botLogo}
                    alt={botName}
                    className="w-8 h-8 rounded-xl object-cover border border-indigo-400/60 shadow-sm"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                    🤖
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900"></span>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-xs tracking-wide text-indigo-100 truncate flex items-center gap-1.5">
                  <span>{botName}</span>
                  <span className="text-[9px] bg-indigo-500/30 text-indigo-300 font-semibold px-1.5 py-0.2 rounded border border-indigo-400/30">AI</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">On-Premise RAG Assistant</div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={clearChat}
                title="Clear chat"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close chat"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70 text-xs">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "assistant" ? (
                  <div className="shrink-0 mt-0.5">
                    {botGif ? (
                      <img src={botGif} alt="Bot" className="w-6 h-6 rounded-lg object-cover border border-indigo-200" />
                    ) : botLogo ? (
                      <img src={botLogo} alt="Bot" className="w-6 h-6 rounded-lg object-cover border border-indigo-200" />
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                        🤖
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {user?.name?.charAt(0) || "U"}
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white shadow-sm rounded-tr-xs"
                      : "bg-white border border-slate-200/80 text-slate-800 shadow-sm rounded-tl-xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Chatbot GIF Typing Indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-indigo-100 shadow-sm w-fit">
                {botGif ? (
                  <img src={botGif} alt="Thinking..." className="w-6 h-6 rounded-lg object-cover border border-indigo-300 animate-bounce" />
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center text-[10px] animate-pulse">
                    🤖
                  </div>
                )}
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                  <span>{botName} is thinking</span>
                  <Sparkles className="w-3 h-3 text-indigo-500 animate-spin" />
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-2.5 border-t border-slate-100 bg-white">
            <form onSubmit={sendMessage} className="flex items-center gap-1.5">
              <Input
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder={`Ask ${botName}...`}
                className="text-xs h-9 rounded-xl border-slate-200 focus-visible:ring-indigo-500"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputMsg.trim() || isTyping}
                className="h-9 w-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shrink-0 shadow-md shadow-indigo-100"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-testid="ai-chatbot-widget-btn"
        className={`group flex items-center gap-2 px-3.5 py-3 rounded-full shadow-xl transition-all duration-300 ${
          isOpen
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:scale-105 shadow-indigo-200"
        }`}
      >
        <div className="relative flex items-center justify-center">
          {botGif ? (
            <img src={botGif} alt={botName} className="w-6 h-6 rounded-full object-cover border border-white/40" />
          ) : botLogo ? (
            <img src={botLogo} alt={botName} className="w-6 h-6 rounded-full object-cover border border-white/40" />
          ) : (
            <Bot className="w-5 h-5 text-white" />
          )}
          {!isOpen && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-indigo-700 animate-ping"></span>}
        </div>
        <span className="text-xs font-bold tracking-tight pr-0.5">{isOpen ? "Close" : botName}</span>
      </button>
    </div>
  );
}
