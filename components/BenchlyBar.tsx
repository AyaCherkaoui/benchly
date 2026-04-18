'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Mic, MicOff } from 'lucide-react'
import { speakText, stopSpeaking } from '@/lib/speak'
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

const WAKE_RESPONSES = ["Hey!", "Yes?", "I'm here.", "What's up?", "Go ahead."]
let wakeResponseIndex = 0
function nextWakeResponse(): string {
  const r = WAKE_RESPONSES[wakeResponseIndex % WAKE_RESPONSES.length]
  wakeResponseIndex++
  return r
}

function keywordFallback(t: string): InterpretedAction {
  if (t.includes('next step') || t === 'next') return { action: 'next_step' }
  if (t.includes('mark complete') || t.includes('step complete') || t.includes("i'm done") || t.includes('finished') || t === 'complete' || t === 'done')
    return { action: 'mark_complete' }
  if (t === 'start' || t === 'ready' || t === 'begin' || t === 'go' || t.includes('start timer') || t.includes('ready to start'))
    return { action: 'start_timer' }
  if (t.includes('pause timer') || t === 'pause') return { action: 'pause_timer' }
  if (t.includes('dashboard') || t.includes('home') || t.includes('main page'))
    return { action: 'navigate', destination: '/dashboard' }
  if (t.includes('sample') && !t.includes('log sample') && !t.includes('add tube'))
    return { action: 'navigate', destination: '/samples' }
  if (t.includes('meeting')) return { action: 'navigate', destination: '/meeting' }
  if (t.includes('protocol') && !t.includes('step'))
    return { action: 'navigate', destination: '/protocol' }
  if (t === 'exit' || t.includes('stop listening') || t.includes('turn off') || t.includes('deactivate') || t.includes('quit hands-free') || t.includes('exit hands-free'))
    return { action: 'exit_handsfree' }
  if (t.includes('log sample') || t.includes('add tube') || t.includes('save sample') || t.includes('store tube')) {
    const tubeMatch = t.match(/tube\s+([a-z0-9]+)/i)
    const inMatch = t.match(/\bin\s+([\w\s°\-]+?)(?:\s*$)/i)
    return { action: 'log_sample', tube_label: tubeMatch?.[1] ?? 'unknown', location: inMatch?.[1]?.trim() ?? 'unknown' }
  }
  const benchlyMatch = t.match(/^(?:hey )?benchly\s+(.+)$/)
  if (benchlyMatch) return { action: 'ask_ai', question: benchlyMatch[1] }
  return { action: 'unknown' }
}

type WaveState = 'idle' | 'listening' | 'processing' | 'speaking'

function SoundWave({ state }: { state: WaveState }) {
  const heights = [12, 20, 28, 20, 12]
  const animClass =
    state === 'idle' ? '' :
    state === 'speaking' ? 'animate-wave-fast' :
    state === 'listening' ? 'animate-wave' : 'animate-pulse'

  return (
    <div className="flex items-center gap-[3px]">
      {heights.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full ${animClass}`}
          style={{
            height: state === 'idle' ? 6 : h,
            background: 'var(--accent)',
            opacity: state === 'idle' ? 0.3 : 0.8,
            animationDelay: `${i * 0.1}s`,
            transition: 'height 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}

export default function BenchlyBar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createSupabaseBrowserClient()
  const { sessionState, callbacksRef, timerCompleteListenersRef } = useProtocolSession()

  const [active, setActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [supported, setSupported] = useState(false)
  const [waveState, setWaveState] = useState<WaveState>('idle')
  const [statusText, setStatusText] = useState("Say 'Hey Benchly' to get started")

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false)
  const mutedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const prevStepIndexRef = useRef<number | null>(null)
  const prevProtocolIdRef = useRef<string | null>(null)
  const sessionStateRef = useRef(sessionState)
  sessionStateRef.current = sessionState
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition))
  }, [])

  useEffect(() => { mutedRef.current = muted }, [muted])

  useEffect(() => {
    if (!active) { prevStepIndexRef.current = null; prevProtocolIdRef.current = null; return }
    const { protocol, steps, currentStepIndex } = sessionState
    if (!protocol || !steps.length) return
    const protocolId = protocol.id
    const prevProtocolId = prevProtocolIdRef.current
    const prevStepIndex = prevStepIndexRef.current
    if (prevProtocolId === protocolId && prevStepIndex === currentStepIndex) return
    prevProtocolIdRef.current = protocolId
    prevStepIndexRef.current = currentStepIndex
    const delay = prevProtocolId === null ? 2000 : 0
    const timer = setTimeout(() => { if (activeRef.current) speakStepIntro(currentStepIndex) }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionState.currentStepIndex, sessionState.protocol?.id])

  useEffect(() => {
    const handler = () => {
      if (!activeRef.current) return
      speak("Timer complete. Let me know when you're done with this step.")
    }
    timerCompleteListenersRef.current.push(handler)
    return () => { timerCompleteListenersRef.current = timerCompleteListenersRef.current.filter((fn) => fn !== handler) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function speak(text: string): Promise<void> {
    if (mutedRef.current) return
    isSpeakingRef.current = true
    setWaveState('speaking')
    setStatusText('Benchly is speaking…')
    await speakText(text).catch(() => {})
    isSpeakingRef.current = false
    if (activeRef.current) { setWaveState('listening'); setStatusText('Listening…') }
    else { setWaveState('idle'); setStatusText("Say 'Hey Benchly' to get started") }
  }

  function speakStepIntro(stepIndex: number) {
    const { protocol, steps } = sessionStateRef.current
    if (!protocol || !steps.length) return
    const step = steps[stepIndex]
    if (!step) return
    const firstSentence = (step.instructions ?? '').split(/[.!?]/)[0]?.trim() ?? ''
    const hasTimer = !!step.timer_seconds
    let intro = `You're on step ${stepIndex + 1} of ${steps.length} — ${step.title}.`
    if (firstSentence) intro += ` ${firstSentence}.`
    speak(intro).then(() => {
      if (hasTimer && activeRef.current) {
        return speak(`This step requires a ${Math.round((step.timer_seconds ?? 0) / 60)} minute timer. Say 'ready' or 'start timer' when you want to begin.`)
      }
    })
  }

  function isWakeWord(t: string) {
    return t.startsWith('hey benchly') || t.startsWith('hi benchly') || t.startsWith('hello benchly') || t.startsWith('benchly')
  }

  function isStopWord(t: string) {
    return t === 'stop' || t === 'quiet' || t === 'shut up' || t === 'listen' || t === 'pause' || t.startsWith('hey benchly') || t.startsWith('benchly')
  }

  async function interpretTranscript(transcript: string): Promise<InterpretedAction> {
    try {
      const { protocol, steps, currentStepIndex } = sessionStateRef.current
      const currentStep = steps[currentStepIndex]
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, context: { currentPage: pathnameRef.current, currentStep: currentStep?.title ?? '', protocolName: protocol?.name ?? '', stepNumber: currentStepIndex + 1, totalSteps: steps.length } }),
      })
      if (!res.ok) throw new Error(`interpret ${res.status}`)
      return (await res.json()) as InterpretedAction
    } catch {
      return keywordFallback(transcript)
    }
  }

  async function logVoice(transcript: string, action: InterpretedAction, response?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const type = action.action === 'ask_ai' ? 'question' : action.action === 'unknown' ? 'unknown' : 'command'
      const protocolId = action.action !== 'navigate' && action.action !== 'exit_handsfree' ? (sessionStateRef.current.protocol?.id ?? null) : null
      await supabase.from('voice_logs').insert({ user_id: user.id, protocol_id: protocolId, type, transcript, response: response ?? null, action_taken: action.action })
    } catch { /* silent */ }
  }

  async function executeAction(action: InterpretedAction, transcript: string) {
    const callbacks = callbacksRef.current
    let response: string | undefined
    switch (action.action) {
      case 'next_step': response = 'Moving to next step.'; await speak(response); callbacks?.onNextStep(); break
      case 'mark_complete': response = 'Got it. Step marked as complete.'; await speak(response); callbacks?.onMarkComplete(); break
      case 'start_timer': response = 'Timer started.'; await speak(response); callbacks?.onStartTimer(); break
      case 'pause_timer': response = 'Timer paused.'; await speak(response); callbacks?.onPauseTimer(); break
      case 'navigate': {
        const label = action.destination.replace('/', '') || 'dashboard'
        response = `Taking you to ${label}.`
        await speak(response)
        router.push(action.destination)
        break
      }
      case 'ask_ai': {
        response = 'Let me check that for you.'
        await speak(response)
        try {
          const { steps, currentStepIndex } = sessionStateRef.current
          const currentStep = steps[currentStepIndex]
          const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: action.question, currentStep: currentStep?.title ?? '' }) })
          const data = await res.json()
          if (data.reply) { response = data.reply; await speak(data.reply) }
        } catch { await speak("Sorry, I couldn't get an answer right now.") }
        break
      }
      case 'log_sample': {
        const label = action.tube_label; const loc = action.location
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) await supabase.from('samples').insert({ user_id: user.id, sample_id_label: `SMPL-${Date.now()}`, tube_label: label, location: loc, notes: action.notes ?? null, protocol_id: sessionStateRef.current.protocol?.id ?? null })
          response = `Got it. Sample ${label} logged in ${loc}.`
        } catch { response = 'Sorry, I could not log that sample.' }
        await speak(response)
        break
      }
      case 'exit_handsfree': response = 'Hands-free mode deactivated.'; await speak(response); stopBenchly(); break
      default: break
    }
    await logVoice(transcript, action, response)
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1; recognition.lang = 'en-US'
    recognition.onstart = () => { if (activeRef.current) { setWaveState('listening'); setStatusText('Listening…') } }
    recognition.onend = () => { if (activeRef.current && recognitionRef.current === recognition) startRecognition() }
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') { stopBenchly(); return }
      if (activeRef.current && recognitionRef.current === recognition) startRecognition()
    }
    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      if (isProcessingRef.current) return
      isProcessingRef.current = true
      const transcript = event.results[0][0].transcript.toLowerCase().trim()
      recognitionRef.current = null; recognition.stop()
      if (isSpeakingRef.current && isStopWord(transcript)) {
        stopSpeaking(); isSpeakingRef.current = false
        setWaveState('listening'); setStatusText('Listening…')
        const reply = nextWakeResponse()
        isProcessingRef.current = false
        setTimeout(() => { if (activeRef.current) startRecognition() }, 300)
        await speak(reply); return
      }
      if (!activeRef.current) {
        if (isWakeWord(transcript)) {
          startBenchly(); const reply = nextWakeResponse()
          isProcessingRef.current = false
          await speak(reply)
          setTimeout(() => { if (activeRef.current) startRecognition() }, 1500)
          return
        }
        isProcessingRef.current = false
        setTimeout(() => startRecognition(), 300); return
      }
      const rest = transcript.replace(/^(hey benchly|hi benchly|hello benchly|benchly)\s*/i, '').trim()
      if (isWakeWord(transcript) && !rest) {
        stopSpeaking(); isSpeakingRef.current = false
        const reply = nextWakeResponse()
        isProcessingRef.current = false
        await speak(reply)
        setTimeout(() => { if (activeRef.current) startRecognition() }, 1500); return
      }
      setWaveState('processing'); setStatusText('Thinking…')
      const action = await interpretTranscript(rest || transcript)
      await executeAction(action, transcript)
      isProcessingRef.current = false
      if (activeRef.current && action.action !== 'exit_handsfree' && action.action !== 'navigate') {
        setTimeout(() => { if (activeRef.current) startRecognition() }, 1500)
      }
    }
    recognitionRef.current = recognition
    setTimeout(() => recognition.start(), 100)
  }

  function startBenchly() { activeRef.current = true; setActive(true); setWaveState('listening'); setStatusText('Listening…') }
  function stopBenchly() {
    activeRef.current = false; isProcessingRef.current = false; isSpeakingRef.current = false
    recognitionRef.current?.stop(); recognitionRef.current = null
    setActive(false); setWaveState('idle'); setStatusText("Say 'Hey Benchly' to get started")
  }
  function toggleMute() { const next = !muted; setMuted(next); if (next) stopSpeaking() }

  useEffect(() => {
    if (!supported) return
    startRecognition()
    return () => { recognitionRef.current?.stop(); recognitionRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  return (
    <div
      className="flex h-10 w-full items-center justify-between px-8"
      style={{ background: '#080808', borderBottom: '1px solid var(--border)' }}
    >
      {/* Left */}
      <div
        className="flex items-center gap-2"
        style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
      >
        <Mic size={12} style={{ color: 'var(--accent)' }} />
        <span>Hands-Free</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-3">
        <SoundWave state={supported ? waveState : 'idle'} />
        <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {statusText}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {active && (
          <button
            onClick={stopBenchly}
            style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
            className="hover:opacity-80 transition-opacity"
          >
            Deactivate
          </button>
        )}
        <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ color: 'var(--text-muted)' }} className="hover:opacity-80 transition-opacity">
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
      </div>
    </div>
  )
}
