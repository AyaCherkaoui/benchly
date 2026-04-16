'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Volume2, VolumeX, X } from 'lucide-react'
import { speakText } from '@/lib/speak'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatProps {
  currentStep: string
  open: boolean
  onClose: () => void
}

// Browser Speech API type declarations (not in all TS lib targets)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult
  length: number
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

export default function AIChat({ currentStep, open, onClose }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [speechSupported, setSpeechSupported] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Keep a ref to the latest messages so sendMessageWith can always close over it
  const messagesRef = useRef<Message[]>(messages)
  messagesRef.current = messages
  const ttsEnabledRef = useRef(ttsEnabled)
  ttsEnabledRef.current = ttsEnabled

  // Detect speech recognition support once on mount
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    )
  }, [])

  function speak(text: string) {
    if (!ttsEnabledRef.current) return
    speakText(text)
  }

  async function sendMessageWith(text: string) {
    const userMessage = text.trim()
    if (!userMessage || loading) return

    const next: Message[] = [
      ...messagesRef.current,
      { role: 'user', content: userMessage },
    ]
    setMessages(next)
    messagesRef.current = next
    setInput('')
    setLoading(true)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, currentStep }),
    })
    const data = await res.json()

    const updated: Message[] = [
      ...next,
      { role: 'assistant' as const, content: data.reply },
    ].slice(-10)
    setMessages(updated)
    messagesRef.current = updated
    setLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    speak(data.reply)
  }

  function handleSend() {
    sendMessageWith(input)
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    // Cancel any ongoing TTS before listening so the mic doesn't pick up the speaker
    window.speechSynthesis.cancel() // cancel browser TTS fallback
    // (ElevenLabs audio stops naturally; no global cancel needed)

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false)
      if (event.error === 'not-allowed') {
        console.warn('Microphone permission denied')
      }
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0]
      const transcript = result[0].transcript
      // Show interim transcript in the input box while speaking
      setInput(transcript)
      // Only send when the result is finalised
      if (result.isFinal) {
        setTimeout(() => sendMessageWith(transcript), 50)
      }
    }

    recognitionRef.current = recognition
    // Small delay lets the browser permission prompt fully resolve before starting
    setTimeout(() => recognition.start(), 100)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  if (!open) return null

  return (
    <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[350px] flex-col rounded-2xl bg-[#152235] shadow-2xl ring-1 ring-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-700 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">Benchly AI</p>
          <p className="truncate text-xs text-slate-400">
            Helping with: {currentStep}
          </p>
        </div>
        <div className="ml-3 flex flex-shrink-0 items-center gap-1">
          {/* TTS toggle */}
          <button
            onClick={() => {
              if (ttsEnabled) window.speechSynthesis.cancel() // stop fallback TTS if active
              setTtsEnabled((v) => !v)
            }}
            title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
            className="rounded-lg p-1.5 text-slate-400 transition hover:text-white"
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
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

      {/* Input row */}
      <div className="flex gap-2 border-t border-slate-700 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask Benchly…"
          className="flex-1 rounded-lg bg-[#0d1b2a] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
        />

        {/* Mic button — hidden if unsupported */}
        {speechSupported && (
          <button
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Stop recording' : 'Speak your question'}
            className={`flex-shrink-0 rounded-lg p-2 transition ${
              listening
                ? 'animate-pulse bg-red-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-teal-500 hover:text-white'
            }`}
          >
            <Mic size={16} />
          </button>
        )}

        <button
          onClick={handleSend}
          disabled={loading}
          className="flex-shrink-0 rounded-lg bg-teal-500 p-2 text-white transition hover:bg-teal-400 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
