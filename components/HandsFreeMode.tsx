'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Mic, MicOff } from 'lucide-react'
import { speakText } from '@/lib/speak'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'

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

// ── Action types ──────────────────────────────────────────────────────────────

type InterpretedAction =
  | { action: 'next_step' }
  | { action: 'mark_complete' }
  | { action: 'start_timer' }
  | { action: 'pause_timer' }
  | { action: 'navigate'; destination: string }
  | { action: 'ask_ai'; question: string }
  | { action: 'log_sample'; tube_label: string; location: string; notes?: string }
  | { action: 'exit_handsfree' }
  | { action: 'unknown' }

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
  if (
    t === 'start' ||
    t === 'ready' ||
    t === 'begin' ||
    t === 'go' ||
    t.includes('start timer') ||
    t.includes('ready to start')
  )
    return { action: 'start_timer' }
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
  if (
    t.includes('log sample') ||
    t.includes('add tube') ||
    t.includes('save sample') ||
    t.includes('store tube')
  ) {
    const tubeMatch = t.match(/tube\s+([a-z0-9]+)/i)
    const inMatch = t.match(/\bin\s+([\w\s°\-]+?)(?:\s*$)/i)
    return {
      action: 'log_sample',
      tube_label: tubeMatch?.[1] ?? 'unknown',
      location: inMatch?.[1]?.trim() ?? 'unknown',
    }
  }
  const benchlyMatch = t.match(/^(?:hey )?benchly\s+(.+)$/)
  if (benchlyMatch) return { action: 'ask_ai', question: benchlyMatch[1] }
  return { action: 'unknown' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HandsFreeMode() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createSupabaseBrowserClient()
  const { sessionState, callbacksRef, timerCompleteListenersRef } = useProtocolSession()

  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(false)
  const [statusText, setStatusText] = useState('Listening…')
  const [lastHeard, setLastHeard] = useState('')
  const [lastAction, setLastAction] = useState('')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false)
  const isProcessingRef = useRef(false)

  // Track which step/protocol we've already spoken the intro for
  const prevStepIndexRef = useRef<number | null>(null)
  const prevProtocolIdRef = useRef<string | null>(null)

  // Always-fresh refs for async closures
  const sessionStateRef = useRef(sessionState)
  sessionStateRef.current = sessionState
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // ── Browser support ─────────────────────────────────────────────────────

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    )
  }, [])

  // ── Proactive step intro ─────────────────────────────────────────────────
  // Fires when hands-free is active AND the protocol step changes (or protocol
  // first becomes available after activation).

  useEffect(() => {
    if (!active) {
      // Reset tracking when mode is turned off
      prevStepIndexRef.current = null
      prevProtocolIdRef.current = null
      return
    }

    const { protocol, steps, currentStepIndex } = sessionState
    if (!protocol || !steps.length) return

    const protocolId = protocol.id
    const prevProtocolId = prevProtocolIdRef.current
    const prevStepIndex = prevStepIndexRef.current

    const protocolChanged = prevProtocolId !== protocolId
    const stepChanged = prevStepIndex !== currentStepIndex

    if (!protocolChanged && !stepChanged) return

    prevProtocolIdRef.current = protocolId
    prevStepIndexRef.current = currentStepIndex

    // Delay on first intro (after "Hands-free mode activated." finishes ~1.5 s)
    const delay = prevProtocolId === null ? 2000 : 0

    const timer = setTimeout(() => {
      if (activeRef.current) speakStepIntro(currentStepIndex)
    }, delay)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionState.currentStepIndex, sessionState.protocol?.id])

  // ── Timer-complete listener ──────────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      if (!activeRef.current) return
      speakText("Timer complete. Let me know when you're done with this step.").catch(
        () => {}
      )
    }
    timerCompleteListenersRef.current.push(handler)
    return () => {
      timerCompleteListenersRef.current = timerCompleteListenersRef.current.filter(
        (fn) => fn !== handler
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step intro speech ────────────────────────────────────────────────────

  function speakStepIntro(stepIndex: number) {
    const { protocol, steps } = sessionStateRef.current
    if (!protocol || !steps.length) return
    const step = steps[stepIndex]
    if (!step) return

    const firstSentence = (step.instructions ?? '').split(/[.!?]/)[0]?.trim() ?? ''
    const hasTimer = !!step.timer_seconds

    let intro = `You're on step ${stepIndex + 1} of ${steps.length} — ${step.title}.`
    if (firstSentence) intro += ` ${firstSentence}.`

    speakText(intro)
      .then(() => {
        if (hasTimer && activeRef.current) {
          return speakText("Say 'start' when you want to begin the timer.")
        }
      })
      .catch(() => {})
  }

  // ── Claude interpretation (with keyword fallback) ─────────────────────────

  async function interpretTranscript(transcript: string): Promise<InterpretedAction> {
    try {
      const { protocol, steps, currentStepIndex } = sessionStateRef.current
      const currentStep = steps[currentStepIndex]
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          context: {
            currentPage: pathnameRef.current,
            currentStep: currentStep?.title ?? '',
            protocolName: protocol?.name ?? '',
            stepNumber: currentStepIndex + 1,
            totalSteps: steps.length,
          },
        }),
      })
      if (!res.ok) throw new Error(`interpret ${res.status}`)
      return (await res.json()) as InterpretedAction
    } catch {
      return keywordFallback(transcript)
    }
  }

  // ── Supabase logging ──────────────────────────────────────────────────────

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

      const protocolId =
        action.action !== 'navigate' && action.action !== 'exit_handsfree'
          ? (sessionStateRef.current.protocol?.id ?? null)
          : null

      await supabase.from('voice_logs').insert({
        user_id: user.id,
        protocol_id: protocolId,
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

    const callbacks = callbacksRef.current
    let response: string | undefined

    switch (action.action) {
      case 'next_step':
        setLastAction('Next step')
        response = 'Moving to next step.'
        await speakText(response)
        callbacks?.onNextStep()
        break

      case 'mark_complete':
        setLastAction('Mark complete')
        response = 'Got it. Step marked as complete.'
        await speakText(response)
        callbacks?.onMarkComplete()
        break

      case 'start_timer':
        setLastAction('Start timer')
        response = 'Timer started.'
        await speakText(response)
        callbacks?.onStartTimer()
        break

      case 'pause_timer':
        setLastAction('Pause timer')
        response = 'Timer paused.'
        await speakText(response)
        callbacks?.onPauseTimer()
        break

      case 'navigate': {
        const label = action.destination.replace('/', '') || 'dashboard'
        setLastAction(`Navigate → ${label}`)
        response = `Taking you to ${label}.`
        console.log('[HandsFree] Navigating to:', action.destination)
        await speakText(response)
        router.push(action.destination)
        break
      }

      case 'ask_ai': {
        setLastAction(`Asked: "${action.question}"`)
        response = 'Let me check that for you.'
        await speakText(response)
        try {
          const { steps, currentStepIndex } = sessionStateRef.current
          const currentStep = steps[currentStepIndex]
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: action.question,
              currentStep: currentStep?.title ?? '',
            }),
          })
          const data = await res.json()
          if (data.reply) {
            response = data.reply
            await speakText(data.reply)
          }
        } catch {
          await speakText("Sorry, I couldn't get an answer right now.")
        }
        break
      }

      case 'log_sample': {
        const label = action.tube_label
        const loc = action.location
        setLastAction(`Sample logged → ${label}`)
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            await supabase.from('samples').insert({
              user_id: user.id,
              sample_id_label: `SMPL-${Date.now()}`,
              tube_label: label,
              location: loc,
              notes: action.notes ?? null,
              protocol_id: sessionStateRef.current.protocol?.id ?? null,
            })
          }
          response = `Got it. Sample ${label} logged in ${loc}.`
        } catch {
          response = 'Sorry, I could not log that sample.'
        }
        await speakText(response)
        break
      }

      case 'exit_handsfree':
        setLastAction('Exit')
        response = 'Hands-free mode deactivated.'
        await speakText(response)
        stopHandsFree()
        break

      case 'unknown':
      default:
        // Don't update lastAction — keep showing previous action
        break
    }

    await logVoice(transcript, action, response)

    if (action.action !== 'unknown' && action.action !== 'exit_handsfree') {
      setStatusText('Listening…')
    }
  }

  // ── Recognition loop ──────────────────────────────────────────────────────

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = false // manual restart — more stable in Safari
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.lang = 'en-US'

    recognition.onstart = () => setStatusText('Listening…')

    recognition.onend = () => {
      // Only auto-restart if this instance is still current and we're not processing
      if (activeRef.current && recognitionRef.current === recognition) {
        startRecognition()
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        console.warn('[HandsFree] Microphone permission denied')
        stopHandsFree()
        return
      }
      if (activeRef.current && recognitionRef.current === recognition) {
        startRecognition()
      }
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      // Guard: ignore if already processing a command
      if (isProcessingRef.current) return
      isProcessingRef.current = true

      const transcript = event.results[0][0].transcript.toLowerCase().trim()

      // Null out ref BEFORE stop() so onend won't auto-restart while we process
      recognitionRef.current = null
      recognition.stop()

      setLastHeard(transcript)
      setStatusText('Interpreting…')

      const action = await interpretTranscript(transcript)
      await executeAction(action, transcript)

      isProcessingRef.current = false

      // navigate / exit_handsfree stop permanently; everything else restarts
      // after 1500 ms so the TTS confirmation finishes before the mic opens
      if (
        activeRef.current &&
        action.action !== 'exit_handsfree' &&
        action.action !== 'navigate'
      ) {
        setTimeout(() => {
          if (activeRef.current) startRecognition()
        }, 1500)
      }
    }

    recognitionRef.current = recognition
    setTimeout(() => recognition.start(), 100)
  }

  function startHandsFree() {
    activeRef.current = true
    setActive(true)
    startRecognition()
    speakText('Hands-free mode activated.').catch(() => {})
  }

  function stopHandsFree() {
    activeRef.current = false
    isProcessingRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setActive(false)
    setStatusText('Listening…')
    setLastHeard('')
    setLastAction('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!supported) return null

  // ── Inactive: small floating mic button ───────────────────────────────────
  if (!active) {
    return (
      <button
        onClick={startHandsFree}
        title="Activate hands-free mode"
        aria-label="Activate hands-free mode"
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 shadow-lg transition hover:bg-teal-400 active:scale-95"
      >
        <Mic size={22} className="text-white" />
      </button>
    )
  }

  // ── Active: floating card ─────────────────────────────────────────────────
  return (
    <div className="fixed bottom-24 right-6 z-40 w-[300px] overflow-hidden rounded-2xl bg-[#152235] shadow-2xl ring-1 ring-green-500/30">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-green-400">
          {statusText}
        </span>
        <button
          onClick={stopHandsFree}
          title="Exit hands-free mode"
          className="flex-shrink-0 rounded-lg p-1 text-slate-400 transition hover:text-white"
        >
          <MicOff size={16} />
        </button>
      </div>

      {/* Last heard */}
      {lastHeard && (
        <div className="border-t border-slate-700/50 px-4 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Heard
          </p>
          <p className="truncate text-sm text-slate-300">"{lastHeard}"</p>
        </div>
      )}

      {/* Last action */}
      {lastAction && (
        <div className="border-t border-slate-700/50 px-4 py-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Action
          </p>
          <p className="truncate text-sm text-teal-400">{lastAction}</p>
        </div>
      )}
    </div>
  )
}
