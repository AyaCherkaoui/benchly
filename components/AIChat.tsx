'use client'

import { useRef, useState } from 'react'
import { X, Send } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatProps {
  currentStep: string
  open: boolean
  onClose: () => void
}

export default function AIChat({ currentStep, open, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput('')

    const next: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(next)
    setLoading(true)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, currentStep }),
    })
    const data = await res.json()

    // Keep last 10 messages
    const updated: Message[] = [...next, { role: 'assistant', content: data.reply }].slice(-10)
    setMessages(updated)
    setLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  if (!open) return null

  return (
    <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[350px] flex-col rounded-2xl bg-[#152235] shadow-2xl ring-1 ring-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-700 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">Benchly AI</p>
          <p className="truncate text-xs text-slate-400">Helping with: {currentStep}</p>
        </div>
        <button onClick={onClose} className="ml-3 flex-shrink-0 text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Ask me anything about this step!
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'self-end bg-teal-500 text-white'
                : 'self-start bg-slate-700 text-slate-100'
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start rounded-2xl bg-slate-700 px-3 py-2 text-sm text-slate-400">
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-slate-700 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask Benchly…"
          className="flex-1 rounded-lg bg-[#0d1b2a] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="rounded-lg bg-teal-500 p-2 text-white transition hover:bg-teal-400 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
