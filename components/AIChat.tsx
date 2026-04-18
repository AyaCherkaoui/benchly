'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Send, Volume2, VolumeX, X, MessageSquare } from 'lucide-react'
import { speakText } from '@/lib/speak'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; maxAlternatives: number; lang: string
  start(): void; stop(): void; abort(): void
  onstart: (() => void) | null; onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}
interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList }
interface SpeechRecognitionResultList { [index: number]: SpeechRecognitionResult; length: number }
interface SpeechRecognitionResult { [index: number]: SpeechRecognitionAlternative; isFinal: boolean }
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionErrorEvent extends Event { error: string }

export default function AIChat() {
  const { sessionState } = useProtocolSession()
  const currentStep = sessionState.steps[sessionState.currentStepIndex]?.title || 'your current task'
  const protocolName = sessionState.protocol?.name || ''
  const contextLabel = protocolName ? `${protocolName} — ${currentStep}` : currentStep

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [speechSupported, setSpeechSupported] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesRef = useRef<Message[]>(messages)
  messagesRef.current = messages
  const ttsEnabledRef = useRef(ttsEnabled)
  ttsEnabledRef.current = ttsEnabled

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition))
  }, [])

  function speak(text: string) {
    if (!ttsEnabledRef.current) return
    speakText(text)
  }

  async function sendMessageWith(text: string) {
    const userMessage = text.trim()
    if (!userMessage || loading) return
    const next: Message[] = [...messagesRef.current, { role: 'user', content: userMessage }]
    setMessages(next); messagesRef.current = next; setInput(''); setLoading(true)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMessage, currentStep }) })
    const data = await res.json()
    const updated: Message[] = [...next, { role: 'assistant' as const, content: data.reply }].slice(-10)
    setMessages(updated); messagesRef.current = updated; setLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    speak(data.reply)
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    window.speechSynthesis.cancel()
    const recognition = new SR()
    recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1; recognition.lang = 'en-US'
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => { setListening(false); if (e.error === 'not-allowed') console.warn('Mic denied') }
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0]; const transcript = result[0].transcript
      setInput(transcript)
      if (result.isFinal) setTimeout(() => sendMessageWith(transcript), 50)
    }
    recognitionRef.current = recognition
    setTimeout(() => recognition.start(), 100)
  }

  function stopListening() { recognitionRef.current?.stop(); setListening(false) }

  return (
    <>
      {/* "Ask Benchly" pill trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full transition-all duration-150 hover:opacity-90"
        style={{
          background: '#1a1a1a',
          border: '1px solid var(--border)',
          padding: '8px 14px',
        }}
        aria-label="Ask Benchly"
      >
        <MessageSquare size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          Ask Benchly
        </span>
      </button>

      {/* Sliding chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-20 right-6 z-50 flex flex-col overflow-hidden rounded-xl"
            style={{
              width: 340,
              height: 460,
              background: '#111111',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Benchly AI</p>
                <p className="truncate" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                  {contextLabel}
                </p>
              </div>
              <div className="ml-3 flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => { if (ttsEnabled) window.speechSynthesis.cancel(); setTtsEnabled((v) => !v) }}
                  title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
                  className="rounded-lg p-1.5 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="mt-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ask me anything about your lab work.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed"
                  style={m.role === 'user'
                    ? { alignSelf: 'flex-end', background: 'var(--accent)', color: '#0a0a0a' }
                    : { alignSelf: 'flex-start', background: '#1a1a1a', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                  }
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm" style={{ alignSelf: 'flex-start', background: '#1a1a1a', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessageWith(input)}
                placeholder="Ask Benchly…"
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: '#0a0a0a', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              {speechSupported && (
                <button
                  onClick={listening ? stopListening : startListening}
                  className="flex-shrink-0 rounded-lg p-2 transition-opacity hover:opacity-80"
                  style={listening
                    ? { background: 'var(--accent)', color: '#0a0a0a' }
                    : { background: '#1a1a1a', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                  }
                >
                  <Mic size={14} />
                </button>
              )}
              <button
                onClick={() => sendMessageWith(input)}
                disabled={loading}
                className="flex-shrink-0 rounded-lg p-2 transition-opacity hover:opacity-80 disabled:opacity-30"
                style={{ background: 'var(--accent)', color: '#0a0a0a' }}
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
