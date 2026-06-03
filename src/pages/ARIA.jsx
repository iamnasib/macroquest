import { useState, useRef, useEffect } from 'react'
import { useGameStore } from '../store'
import { chat } from '../lib/aria'
import { Spinner } from '../components/ui'

const QUICK_PROMPTS = [
  {
    label: "📊 Daily Insight",
    msg: "Give me my daily insight and what I should focus on.",
  },
  {
    label: "🍽️ Meal Suggestions",
    msg: "Suggest some high-protein Indian meals I can have today.",
  },
  {
    label: "⚡ Energy Boost",
    msg: "I need a quick high-calorie snack. What should I eat?",
  },
  {
    label: "🏆 Weekly Review",
    msg: "Give me a weekly warrior summary and my mission for next week.",
  },
  {
    label: "🔩 Hit Protein Goal",
    msg: "How can I hit my Iron Crystal (protein) goal today?",
  },
  {
    label: "🧠 Nutrition Tip",
    msg: "Give me one nutrition tip that most people overlook.",
  },
];

export default function ARIAPage() {
  const {todayTotals, profile, levelData, streakData} = useGameStore();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `⚔️ Greetings, ${profile?.username || "Champion"}! I am **ARIA** — your Adaptive Resource Intelligence Assistant.\n\nI track your quests, analyze your resource intake, and guide your nutrition journey through the realm of MacroQuest.\n\nWhat shall we tackle today?`,
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth"});
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg = {role: "user", content: msg, ts: Date.now()};
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages
        .slice(-6)
        .map((m) => ({role: m.role, content: m.content}));
      const contextMsg = `[Context: Level ${levelData.level}, Calories today: ${todayTotals.calories}/${profile?.calorie_goal || 2000} EP, Protein: ${todayTotals.protein}g/${profile?.protein_goal || 150}g, Streak: ${streakData?.logging || 0} days]\n\n${msg}`;
      const response = await chat(contextMsg, history);
      setMessages((prev) => [
        ...prev,
        {role: "assistant", content: response, ts: Date.now()},
      ]);
    } catch (err) {
      const isRateLimit = err.message === 'RATE_LIMIT'
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isRateLimit
            ? "⚠️ Your ARIA connection has reached its daily capacity. Champions are limited to **20 requests per day** to keep the realm stable. Your quota resets at midnight — return then and we shall continue the quest!"
            : "⚠️ Connection to ARIA interrupted. Please try again in a moment.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className='flex flex-col h-[calc(100vh-4rem)] lg:h-screen max-w-3xl mx-auto'>
      {/* Header */}
      <div className='p-4 border-b border-border bg-abyss shrink-0'>
        <div className='flex items-center gap-3'>
          <div className='relative'>
            <div className='w-10 h-10 rounded-full bg-violet/20 border border-violet/40 flex items-center justify-center text-xl'>
              🤖
            </div>
            <span className='absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald rounded-full border border-abyss' />
          </div>
          <div>
            <h2
              className='font-pixel text-violet'
              style={{fontSize: "0.75rem"}}>
              ARIA
            </h2>
            <p className='text-text-muted font-ui text-xs'>
              Adaptive Resource Intelligence Assistant · Online
            </p>
          </div>
          <div className='ml-auto text-right hidden sm:block'>
            <p className='font-ui text-xs text-text-muted'>Today's intel:</p>
            <p className='font-ui text-xs text-gold'>
              {todayTotals.calories.toFixed(0)} EP ·{" "}
              {todayTotals.protein.toFixed(0)}g Iron
            </p>
          </div>
        </div>

        {/* Quick prompts */}
        <div className='flex gap-2 mt-3 overflow-x-auto pb-1'>
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => sendMessage(p.msg)}
              disabled={loading}
              className='shrink-0 text-xs font-ui border border-border text-text-muted px-3 py-1.5 rounded-full hover:border-violet/40 hover:text-violet transition-all'>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {messages.map((msg) => (
          <div
            key={msg.ts + msg.role}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className='w-8 h-8 rounded-full bg-violet/20 border border-violet/40 flex items-center justify-center text-sm shrink-0 mt-1'>
                🤖
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-gold/10 border border-gold/20 text-text"
                  : "bg-panel border border-border text-text"
              }`}>
              <MessageContent content={msg.content} />
              <p className='text-xs text-text-muted/60 font-ui mt-1.5'>
                {new Date(msg.ts).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {msg.role === "user" && (
              <div className='w-8 h-8 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-sm shrink-0 mt-1'>
                ⚔️
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className='flex gap-3 justify-start'>
            <div className='w-8 h-8 rounded-full bg-violet/20 border border-violet/40 flex items-center justify-center text-sm'>
              🤖
            </div>
            <div className='bg-panel border border-border rounded-xl px-4 py-3 flex items-center gap-2'>
              <Spinner size='sm' />
              <span className='text-text-muted font-ui text-sm'>
                ARIA is thinking...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className='p-4 border-t border-border bg-abyss shrink-0'>
        <div className='flex gap-2'>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder='Ask ARIA about your quests, meals, or strategy...'
            rows={1}
            className='flex-1 bg-deep border border-border rounded-lg px-4 py-2.5 text-text font-ui text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-violet/60 resize-none'
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className='bg-violet/80 hover:bg-violet text-white px-4 rounded-lg transition-colors disabled:opacity-40 font-ui text-sm font-semibold'>
            ⚡
          </button>
        </div>
        <p className='text-xs text-text-muted font-ui mt-1.5 text-center'>
          Powered by NVIDIA NIM · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// Simple markdown-ish renderer for bold
function MessageContent({content}) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className='font-ui text-sm leading-relaxed whitespace-pre-wrap'>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className='text-gold'>
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}
