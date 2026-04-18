'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, usePathname } from 'next/navigation'
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

type MicState = 'idle' | 'listening' | 'processing' | 'speaking'

const WAKE_RESPONSES = ["Hey!", "Yes?", "I'm here.", "What's up?", "Go ahead."]
let wakeResponseIndex = 0
function nextWakeResponse(): string {
  const r = WAKE_RESPONSES[wakeResponseIndex % WAKE_RESPONSES.length]
  wakeResponseIndex++
  return r
}

function keywordFallback(t: string): InterpretedAction {
  if (t.includes('next step') || t === 'next') return { action: 'next_step' }
  if (t.includes('mark complete') || t.includes('step complete') || t.includes("i'm done") || t.includes('finished') || t === 'complete' || t === 'done') return { action: 'mark_complete' }
  if (t === 'start' || t === 'ready' || t === 'begin' || t === 'go' || t.includes('start timer') || t.includes('ready to start')) return { action: 'start_timer' }
  if (t.includes('pause timer') || t === 'pause') return { action: 'pause_timer' }
  if (t.includes('dashboard') || t.includes('home') || t.includes('main page')) return { action: 'navigate', destination: '/dashboard' }
  if (t.includes('sample') && !t.includes('log sample') && !t.includes('add tube')) return { action: 'navigate', destination: '/samples' }
  if (t.includes('meeting')) return { action: 'navigate', destination: '/meeting' }
  if (t.includes('protocol') && !t.includes('step')) return { action: 'navigate', destination: '/protocol' }
  if (t === 'exit' || t.includes('stop listening') || t.includes('turn off') || t.includes('deactivate') || t.includes('exit hands-free')) return { action: 'exit_handsfree' }
  if (t.includes('log sample') || t.includes('add tube') || t.includes('save sample') || t.includes('store tube')) {
    const tubeMatch = t.match(/tube\s+([a-z0-9]+)/i)
    const inMatch = t.match(/\bin\s+([\w\s°\-]+?)(?:\s*$)/i)
    return { action: 'log_sample', tube_label: tubeMatch?.[1] ?? 'unknown', location: inMatch?.[1]?.trim() ?? 'unknown' }
  }
  const benchlyMatch = t.match(/^(?:hey )?benchly\s+(.+)$/)
  if (benchlyMatch) return { action: 'ask_ai', question: benchlyMatch[1] }
  return { action: 'unknown' }
}

// Concentric ring for speaking animation
function Ring({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        inset: -8,
        border: '1.5px solid rgba(232,165,152,0.35)',
        pointerEvents: 'none',
      }}
      animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
      transition={{ duration: 1.6, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  )
}

export default function BenchlyMic() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createSupabaseBrowserClient()
  const { sessionState, callbacksRef, timerCompleteListenersRef } = useProtocolSession()

  const [supported, setSupported] = useState(false)
  const [micState, setMicState] = useState<MicState>('idle')
  const [active, setActive] = useState(false)
  const [labelText, setLabelText] = useState("SAY 'HEY BENCHLY'")
  const [micSize, setMicSize] = useState(80)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false)
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
    const updateSize = () => setMicSize(window.innerWidth < 768 ? 64 : 80)
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Step announcement when protocol changes
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

  // Timer complete listener
  useEffect(() => {
    const handler = () => {
      if (!activeRef.current) return
      doSpeak("Timer complete. Let me know when you're done with this step.")
    }
    timerCompleteListenersRef.current.push(handler)
    return () => { timerCompleteListenersRef.current = timerCompleteListenersRef.current.filter((fn) => fn !== handler) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSpeak(text: string): Promise<void> {
    isSpeakingRef.current = true
    setMicState('speaking')
    setLabelText('SPEAKING...')
    await speakText(text).catch(() => {})
    isSpeakingRef.current = false
    if (activeRef.current) { setMicState('listening'); setLabelText('LISTENING...') }
    else { setMicState('idle'); setLabelText("SAY 'HEY BENCHLY'") }
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
    doSpeak(intro).then(() => {
      if (hasTimer && activeRef.current) {
        return doSpeak(`This step requires a ${Math.round((step.timer_seconds ?? 0) / 60)} minute timer. Say ready or start timer when you want to begin.`)
      }
    })
  }

  function isWakeWord(t: string) {
    return t.startsWith('hey benchly') || t.startsWith('hi benchly') || t.startsWith('hello benchly') || t.startsWith('benchly')
  }
  function isStopWord(t: string) {
    return t === 'stop' || t === 'quiet' || t === 'shut up' || t.startsWith('hey benchly') || t.startsWith('benchly')
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
      case 'next_step': response = 'Moving to next step.'; await doSpeak(response); callbacks?.onNextStep(); break
      case 'mark_complete': response = 'Got it. Step marked as complete.'; await doSpeak(response); callbacks?.onMarkComplete(); break
      case 'start_timer': response = 'Timer started.'; await doSpeak(response); callbacks?.onStartTimer(); break
      case 'pause_timer': response = 'Timer paused.'; await doSpeak(response); callbacks?.onPauseTimer(); break
      case 'navigate': {
        const label = action.destination.replace('/', '') || 'dashboard'
        response = `Taking you to ${label}.`
        await doSpeak(response)
        router.push(action.destination)
        break
      }
      case 'ask_ai': {
        response = 'Let me check that for you.'
        await doSpeak(response)
        try {
          const { steps, currentStepIndex } = sessionStateRef.current
          const currentStep = steps[currentStepIndex]
          const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: action.question, currentStep: currentStep?.title ?? '' }) })
          const data = await res.json()
          if (data.reply) { response = data.reply; await doSpeak(data.reply) }
        } catch { await doSpeak("Sorry, I couldn't get an answer right now.") }
        break
      }
      case 'log_sample': {
        const label = action.tube_label; const loc = action.location
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) await supabase.from('samples').insert({ user_id: user.id, sample_id_label: `SMPL-${Date.now()}`, tube_label: label, location: loc, notes: action.notes ?? null, protocol_id: sessionStateRef.current.protocol?.id ?? null })
          response = `Got it. Sample ${label} logged in ${loc}.`
        } catch { response = 'Sorry, I could not log that sample.' }
        await doSpeak(response)
        break
      }
      case 'exit_handsfree': response = 'Hands-free mode deactivated.'; await doSpeak(response); stopBenchly(); break
      default: break
    }
    await logVoice(transcript, action, response)
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1; recognition.lang = 'en-US'
    recognition.onstart = () => { if (activeRef.current) { setMicState('listening'); setLabelText('LISTENING...') } }
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
        setMicState('listening'); setLabelText('LISTENING...')
        const reply = nextWakeResponse()
        isProcessingRef.current = false
        setTimeout(() => { if (activeRef.current) startRecognition() }, 300)
        await doSpeak(reply); return
      }
      if (!activeRef.current) {
        if (isWakeWord(transcript)) {
          startBenchly()
          const reply = nextWakeResponse()
          isProcessingRef.current = false
          await doSpeak(reply)
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
        await doSpeak(reply)
        setTimeout(() => { if (activeRef.current) startRecognition() }, 1500); return
      }
      setMicState('processing'); setLabelText('THINKING...')
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

  function startBenchly() { activeRef.current = true; setActive(true); setMicState('listening'); setLabelText('LISTENING...') }
  function stopBenchly() {
    activeRef.current = false; isProcessingRef.current = false; isSpeakingRef.current = false
    recognitionRef.current?.stop(); recognitionRef.current = null
    setActive(false); setMicState('idle'); setLabelText("SAY 'HEY BENCHLY'")
  }

  function handleClick() {
    if (!supported) return
    if (active) stopBenchly()
    else { startBenchly(); const reply = nextWakeResponse(); setTimeout(() => doSpeak(reply), 100) }
  }

  useEffect(() => {
    if (!supported) return
    startRecognition()
    return () => { recognitionRef.current?.stop(); recognitionRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  // Mic SVG icon
  const MicIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="2" width="6" height="11" rx="3" fill="#e8a598" />
      <path d="M5 10a7 7 0 0014 0" stroke="#e8a598" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12" y2="21" stroke="#e8a598" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="9" y1="21" x2="15" y2="21" stroke="#e8a598" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  // Border style for processing (rotating gradient)
  const processingBorderStyle = micState === 'processing' ? {
    background: 'conic-gradient(from 0deg, rgba(232,165,152,0.8), rgba(232,165,152,0.1), rgba(232,165,152,0.8))',
    padding: 1.5,
  } : {}

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(32px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {/* Mic button */}
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        {/* Speaking rings */}
        <AnimatePresence>
          {micState === 'speaking' && (
            <>
              <Ring delay={0} />
              <Ring delay={0.4} />
              <Ring delay={0.8} />
            </>
          )}
        </AnimatePresence>

        {/* Processing rotating wrapper */}
        <AnimatePresence>
          {micState === 'processing' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, rgba(232,165,152,0.9) 0%, transparent 60%, rgba(232,165,152,0.9) 100%)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Main circle */}
        <motion.button
          onClick={handleClick}
          animate={
            micState === 'idle'
              ? { scale: [0.97, 1.03, 0.97] }
              : micState === 'listening'
              ? { scale: [0.95, 1.08, 0.95] }
              : { scale: 1 }
          }
          transition={
            micState === 'idle'
              ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
              : micState === 'listening'
              ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
          style={{
            width: micSize,
            height: micSize,
            borderRadius: '50%',
            background: '#111111',
            border: micState === 'listening'
              ? '1px solid rgba(232,165,152,0.5)'
              : '1px solid rgba(255,255,255,0.08)',
            boxShadow: micState === 'listening'
              ? '0 0 0 8px rgba(232,165,152,0.15)'
              : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1,
            outline: 'none',
          }}
          aria-label={active ? 'Deactivate hands-free' : "Activate hands-free — Say Hey Benchly"}
        >
          <MicIcon />
        </motion.button>
      </div>

      {/* Label */}
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: micState === 'idle' ? '#555555' : '#e8a598',
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'color 0.2s ease',
        }}
      >
        {labelText}
      </span>
    </div>
  )
}
