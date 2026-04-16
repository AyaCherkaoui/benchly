'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { speakText } from '@/lib/speak'

// ── Speech API types (shared with AIChat) ──────────────────────────────────

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

// ── Props ──────────────────────────────────────────────────────────────────

interface HandsFreeModeProps {
  onNextStep: () => void
  onMarkComplete: () => void
  onStartTimer: () => void
  onPauseTimer: () => void
  onAskAI: (question: string) => Promise<void>
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HandsFreeMode({
  onNextStep,
  onMarkComplete,
  onStartTimer,
  onPauseTimer,
  onAskAI,
}: HandsFreeModeProps) {
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(false)
  const [statusText, setStatusText] = useState('Listening…')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    )
  }, [])

  // Restart recognition after each result so continuous listening keeps going
  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = false // restart manually for stability
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    recognition.onstart = () => setStatusText('Listening…')

    recognition.onend = () => {
      // Restart as long as hands-free mode is still active
      if (recognitionRef.current) startRecognition()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        console.warn('Microphone permission denied')
        stopHandsFree()
        return
      }
      // For transient errors (no-speech, network), just restart
      if (recognitionRef.current) startRecognition()
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim()
      recognitionRef.current = null // pause while processing command

      await handleCommand(transcript)

      // Resume after command is handled
      if (active || recognitionRef.current !== null) {
        recognitionRef.current = { ...recognition } // sentinel to signal restart
        startRecognition()
      }
    }

    recognitionRef.current = recognition
    setTimeout(() => recognition.start(), 100)
  }

  async function handleCommand(transcript: string) {
    setStatusText(`Heard: "${transcript}"`)

    if (transcript === 'next step' || transcript === 'next') {
      await speakText('Moving to next step.')
      onNextStep()
      return
    }

    if (transcript === 'mark complete' || transcript === 'complete') {
      await speakText('Got it. Step marked as complete.')
      onMarkComplete()
      return
    }

    if (transcript === 'start timer') {
      await speakText('Timer started.')
      onStartTimer()
      return
    }

    if (transcript === 'pause timer' || transcript === 'pause') {
      await speakText('Timer paused.')
      onPauseTimer()
      return
    }

    // "hey benchly [question]" or "benchly [question]"
    const benchlyMatch =
      transcript.match(/^hey benchly\s+(.+)$/) ||
      transcript.match(/^benchly\s+(.+)$/)
    if (benchlyMatch) {
      const question = benchlyMatch[1]
      setStatusText(`Asking Benchly: "${question}"`)
      await speakText('Let me check that for you.')
      await onAskAI(question)
      return
    }

    // Unrecognised — give soft feedback so user knows it was heard
    setStatusText('Listening…')
  }

  function startHandsFree() {
    setActive(true)
    startRecognition()
    speakText('Hands-free mode activated. I am listening.')
  }

  function stopHandsFree() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setActive(false)
    setStatusText('Listening…')
  }

  if (!supported) return null

  if (!active) {
    return (
      <button
        onClick={startHandsFree}
        className="flex items-center gap-2 rounded-xl bg-teal-500/10 px-4 py-2.5 text-sm font-semibold text-teal-400 ring-1 ring-teal-500/30 transition hover:bg-teal-500/20"
      >
        <Mic size={16} />
        Enter Hands-Free Mode
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-green-500/10 px-4 py-2.5 ring-1 ring-green-500/30">
      {/* Pulsing indicator */}
      <span className="relative flex h-3 w-3 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
      </span>
      <span className="text-sm font-medium text-green-400">
        Hands-Free Active — {statusText}
      </span>
      <button
        onClick={stopHandsFree}
        className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-600"
      >
        <MicOff size={13} />
        Exit
      </button>
    </div>
  )
}
