'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff } from 'lucide-react'
import { speakText } from '@/lib/speak'
import { createSupabaseBrowserClient } from '@/lib/supabase'

// ── Speech API types ──────────────────────────────────────────────────────────

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

// ── Action types (discriminated union) ────────────────────────────────────────

type InterpretedAction =
  | { action: 'next_step' }
  | { action: 'mark_complete' }
  | { action: 'start_timer' }
  | { action: 'pause_timer' }
  | { action: 'navigate'; destination: string }
  | { action: 'ask_ai'; question: string }
  | { action: 'exit_handsfree' }
  | { action: 'unknown' }

// ── Props ─────────────────────────────────────────────────────────────────────

interface HandsFreeModeProps {
  currentStepTitle: string
  protocolName: string
  protocolId?: string
  onNextStep: () => void
  onMarkComplete: () => void
  onStartTimer: () => void
  onPauseTimer: () => void
  onAskAI: (question: string) => Promise<void>
}

// ── Keyword fallback ──────────────────────────────────────────────────────────

function keywordFallback(t: string): InterpretedAction {
  if (t.includes('next step') || t === 'next') return { action: 'next_step' }
  if (
    t.includes('mark complete') ||
    t.includes('step complete') ||
    t.includes("i'm done") ||
    t.includes('finished') ||
    t === 'complete' ||
    t === 'done'
  )
    return { action: 'mark_complete' }
  if (t.includes('start timer')) return { action: 'start_timer' }
  if (t.includes('pause timer') || t === 'pause') return { action: 'pause_timer' }
  if (t.includes('dashboard') || t.includes('home') || t.includes('main page'))
    return { action: 'navigate', destination: '/dashboard' }
  if (t.includes('sample')) return { action: 'navigate', destination: '/samples' }
  if (t.includes('meeting')) return { action: 'navigate', destination: '/meeting' }
  if (t.includes('protocol') && !t.includes('step'))
    return { action: 'navigate', destination: '/protocol' }
  if (
    t === 'exit' ||
    t === 'stop' ||
    t.includes('stop listening') ||
    t.includes('turn off') ||
    t.includes('deactivate') ||
    t.includes('quit hands-free') ||
    t.includes('exit hands-free')
  )
    return { action: 'exit_handsfree' }
  const benchlyMatch = t.match(/^(?:hey )?benchly\s+(.+)$/)
  if (benchlyMatch) return { action: 'ask_ai', question: benchlyMatch[1] }
  return { action: 'unknown' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HandsFreeMode({
  currentStepTitle,
  protocolName,
  protocolId,
  onNextStep,
  onMarkComplete,
  onStartTimer,
  onPauseTimer,
  onAskAI,
}: HandsFreeModeProps) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(false)
  const [statusText, setStatusText] = useState('Listening…')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false) // ref so onend/onresult closures always see current value

  // Keep context fresh so closures always send the latest step/protocol
  const contextRef = useRef({ currentStepTitle, protocolName, protocolId })
  contextRef.current = { currentStepTitle, protocolName, protocolId }

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    )
  }, [])

  // ── Claude interpretation (with keyword fallback) ─────────────────────────

  async function interpretTranscript(transcript: string): Promise<InterpretedAction> {
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          context: {
            currentPage: 'protocol walker',
            currentStep: contextRef.current.currentStepTitle,
            protocolName: contextRef.current.protocolName,
          },
        }),
      })
      if (!res.ok) throw new Error(`interpret ${res.status}`)
      return (await res.json()) as InterpretedAction
    } catch {
      // Network failure or API error → fall back to keywords so mode never breaks
      return keywordFallback(transcript)
    }
  }

  // ── Supabase logging (silent — never breaks hands-free mode) ──────────────

  async function logVoice(
    transcript: string,
    action: InterpretedAction,
    response?: string
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const type =
        action.action === 'ask_ai'
          ? 'question'
          : action.action === 'unknown'
          ? 'unknown'
          : 'command'

      await supabase.from('voice_logs').insert({
        user_id: user.id,
        protocol_id: contextRef.current.protocolId ?? null,
        type,
        transcript,
        response: response ?? null,
        action_taken: action.action,
      })
    } catch {
      // Silent — logging is best-effort
    }
  }

  // ── Execute interpreted action ────────────────────────────────────────────

  async function executeAction(action: InterpretedAction, transcript: string) {
    console.log('[HandsFree] Action received:', JSON.stringify(action))

    let response: string | undefined

    switch (action.action) {
      case 'next_step':
        setStatusText('Moving to next step')
        response = 'Moving to next step.'
        await speakText(response)
        onNextStep()
        break

      case 'mark_complete':
        setStatusText('Marking step complete')
        response = 'Got it. Step marked as complete.'
        await speakText(response)
        onMarkComplete()
        break

      case 'start_timer':
        setStatusText('Starting timer')
        response = 'Timer started.'
        await speakText(response)
        onStartTimer()
        break

      case 'pause_timer':
        setStatusText('Pausing timer')
        response = 'Timer paused.'
        await speakText(response)
        onPauseTimer()
        break

      case 'navigate': {
        const label = action.destination.replace('/', '') || 'dashboard'
        setStatusText(`Navigating to ${label}`)
        response = `Taking you to ${label}.`
        console.log('[HandsFree] Navigating to:', action.destination)
        await speakText(response)
        router.push(action.destination)
        break
      }

      case 'ask_ai':
        setStatusText(`Asking: "${action.question}"`)
        response = 'Let me check that for you.'
        await speakText(response)
        await onAskAI(action.question)
        break

      case 'exit_handsfree':
        setStatusText('Exiting hands-free mode')
        response = 'Hands-free mode deactivated.'
        await speakText(response)
        stopHandsFree()
        break

      case 'unknown':
      default:
        setStatusText('Listening…')
        break
    }

    await logVoice(transcript, action, response)

    // Keep the status visible for 4 s before resetting to "Listening…"
    if (action.action !== 'unknown' && action.action !== 'exit_handsfree') {
      setTimeout(() => setStatusText('Listening…'), 4000)
    }
  }

  // ── Recognition loop ──────────────────────────────────────────────────────

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = false // restart manually — more stable across browsers
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    recognition.onstart = () => setStatusText('Listening…')

    recognition.onend = () => {
      if (activeRef.current) startRecognition()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        console.warn('Microphone permission denied')
        stopHandsFree()
        return
      }
      // Transient errors (no-speech, audio-capture): just restart
      if (activeRef.current) startRecognition()
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim()

      // Pause the loop while we process (onend will fire and see activeRef = true
      // but recognitionRef = null, so startRecognition won't double-start)
      recognitionRef.current = null
      setStatusText(`Heard: "${transcript}" — interpreting…`)

      const action = await interpretTranscript(transcript)
      await executeAction(action, transcript)

      // Resume loop if still active
      if (activeRef.current) {
        recognitionRef.current = recognition // sentinel
        startRecognition()
      }
    }

    recognitionRef.current = recognition
    setTimeout(() => recognition.start(), 100)
  }

  function startHandsFree() {
    activeRef.current = true
    setActive(true)
    startRecognition()
    speakText('Hands-free mode activated. I am listening.')
  }

  function stopHandsFree() {
    activeRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setActive(false)
    setStatusText('Listening…')
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
      <span className="relative flex h-3 w-3 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-green-400">
        Hands-Free Active — {statusText}
      </span>
      <button
        onClick={stopHandsFree}
        className="ml-auto flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-600"
      >
        <MicOff size={13} />
        Exit
      </button>
    </div>
  )
}
