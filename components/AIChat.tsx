'use client'

import { useState } from 'react'

interface AIChatProps {
  currentStep: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AIChat({ currentStep }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage() {
    if (!input.trim()) return
    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, currentStep }),
    })
    const data = await res.json()
    setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex h-64 flex-col gap-2 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded p-2 text-sm ${m.role === 'user' ? 'self-end bg-blue-100' : 'self-start bg-gray-100'}`}
          >
            {m.content}
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">Benchly is thinking...</p>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask Benchly..."
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
