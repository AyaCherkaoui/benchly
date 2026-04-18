'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Circle,
  MessageCircle,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import Timer, { TimerHandle } from '@/components/Timer'
import AIChat from '@/components/AIChat'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'
import { Protocol, Step } from '@/types'

export default function ProtocolWalkerPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const { setSessionState, setCallbacks, clearSession, notifyTimerComplete } =
    useProtocolSession()

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [protocolComplete, setProtocolComplete] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [loading, setLoading] = useState(true)

  // Refs so callbacks always see the latest values without stale closures
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId
  const stepsRef = useRef<Step[]>(steps)
  stepsRef.current = steps
  const currentStepIndexRef = useRef(currentStepIndex)
  currentStepIndexRef.current = currentStepIndex
  const completedStepsRef = useRef<number[]>(completedSteps)
  completedStepsRef.current = completedSteps

  // Timer imperative handle
  const timerRef = useRef<TimerHandle>(null)

  const loadProtocol = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const [{ data: protocolData }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('*').eq('id', params.id).single(),
      supabase
        .from('steps')
        .select('*')
        .eq('protocol_id', params.id)
        .order('step_number'),
    ])

    if (!protocolData || !stepsData?.length) {
      setLoading(false)
      return
    }

    setProtocol(protocolData)
    setSteps(stepsData)

    const { data: existingSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('protocol_id', params.id)
      .order('last_updated', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingSession) {
      setSessionId(existingSession.id)
      sessionIdRef.current = existingSession.id
      const completed: number[] = existingSession.completed_steps ?? []
      setCompletedSteps(completed)
      const idx = stepsData.findIndex(
        (s) => s.step_number === existingSession.current_step
      )
      setCurrentStepIndex(idx >= 0 ? idx : 0)
    }

    setLoading(false)
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadProtocol()
  }, [loadProtocol])

  // ── Register with HandsFreeMode context ──────────────────────────────────
  // Callbacks use refs internally so they're stable — register once on mount.
  useEffect(() => {
    setCallbacks({
      onNextStep: handleNextStep,
      onMarkComplete: handleCompleteStep,
      onStartTimer: () => timerRef.current?.start(),
      onPauseTimer: () => timerRef.current?.pause(),
    })
    return () => clearSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep context session state in sync with page state
  useEffect(() => {
    if (protocol && steps.length) {
      setSessionState({ protocol, steps, currentStepIndex })
    }
  }, [protocol, steps, currentStepIndex, setSessionState])

  // ── Session persistence ───────────────────────────────────────────────────

  async function saveSession(completed: number[], currentStepNumber: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    if (sessionIdRef.current) {
      await supabase
        .from('sessions')
        .update({
          current_step: currentStepNumber,
          completed_steps: completed,
          last_updated: new Date().toISOString(),
        })
        .eq('id', sessionIdRef.current)
    } else {
      const { data } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          protocol_id: params.id,
          current_step: currentStepNumber,
          completed_steps: completed,
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        })
        .select()
        .single()
      if (data) {
        setSessionId(data.id)
        sessionIdRef.current = data.id
      }
    }

    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
  }

  // ── Step actions ──────────────────────────────────────────────────────────

  async function handleCompleteStep() {
    const steps = stepsRef.current
    const idx = currentStepIndexRef.current
    if (!steps.length) return

    const currentStep = steps[idx]
    const newCompleted = [...completedStepsRef.current, currentStep.step_number]
    setCompletedSteps(newCompleted)

    const isLast = idx === steps.length - 1

    if (isLast) {
      setProtocolComplete(true)
      await saveSession(newCompleted, currentStep.step_number)
    } else {
      const nextIndex = idx + 1
      setCurrentStepIndex(nextIndex)
      await saveSession(newCompleted, steps[nextIndex].step_number)
    }
  }

  function handleNextStep() {
    const steps = stepsRef.current
    const idx = currentStepIndexRef.current
    if (idx < steps.length - 1) setCurrentStepIndex(idx + 1)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400">Loading protocol…</p>
      </div>
    )
  }

  if (!protocol || !steps.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400">Protocol not found.</p>
      </div>
    )
  }

  // ── Complete screen ───────────────────────────────────────────────────────
  if (protocolComplete) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl font-bold text-white">Protocol Complete!</h1>
        <p className="text-slate-400">
          {protocol.name} — all {steps.length} steps done
        </p>
        <button
          onClick={() => router.push('/protocol')}
          className="mt-4 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-white transition hover:bg-teal-400"
        >
          Back to Protocols
        </button>
      </div>
    )
  }

  // ── Walker ────────────────────────────────────────────────────────────────
  const currentStep = steps[currentStepIndex]
  const alreadyCompleted = completedSteps.includes(currentStep.step_number)
  const hasTimer = !!currentStep.timer_seconds

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-6">
      {/* ── Left panel: step list ─────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 overflow-y-auto rounded-2xl bg-[#152235] p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {protocol.name}
        </p>
        <div className="flex flex-col gap-1">
          {steps.map((step, idx) => {
            const isCompleted = completedSteps.includes(step.step_number)
            const isCurrent = idx === currentStepIndex
            const isFuture = idx > currentStepIndex && !isCompleted
            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                  isCurrent
                    ? 'bg-teal-500/10 ring-1 ring-teal-500/30'
                    : isCompleted
                    ? 'opacity-60'
                    : isFuture
                    ? 'opacity-35'
                    : ''
                }`}
              >
                {isCompleted ? (
                  <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-green-400" />
                ) : (
                  <Circle
                    size={18}
                    className={`mt-0.5 flex-shrink-0 ${
                      isCurrent ? 'text-teal-400' : 'text-slate-600'
                    }`}
                  />
                )}
                <div className="min-w-0">
                  <p className={`text-xs ${isCurrent ? 'text-teal-400' : 'text-slate-500'}`}>
                    Step {step.step_number}
                  </p>
                  <p
                    className={`truncate text-sm font-medium ${
                      isCurrent ? 'text-white' : isCompleted ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">
              Step {currentStep.step_number} of {steps.length}
            </p>
            <h1 className="text-2xl font-bold text-white">{currentStep.title}</h1>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-sm transition-opacity duration-300 ${
              savedIndicator
                ? 'bg-green-500/10 text-green-400 opacity-100'
                : 'opacity-0'
            }`}
          >
            Session saved ✓
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-2xl bg-[#152235] p-6">
          <p className="whitespace-pre-line leading-relaxed text-slate-200">
            {currentStep.instructions}
          </p>
        </div>

        {/* Warning */}
        {currentStep.warning && (
          <div className="flex items-start gap-3 rounded-2xl bg-yellow-500/10 p-5 ring-1 ring-yellow-500/30">
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-yellow-400" />
            <p className="text-sm leading-relaxed text-yellow-200">
              {currentStep.warning}
            </p>
          </div>
        )}

        {/* Timer — key forces full reset when step changes; notifyTimerComplete
            keeps HandsFreeMode in sync */}
        {hasTimer && (
          <Timer
            key={currentStep.id}
            ref={timerRef}
            seconds={currentStep.timer_seconds!}
            onComplete={notifyTimerComplete}
          />
        )}

        {/* Complete button */}
        <button
          onClick={handleCompleteStep}
          disabled={alreadyCompleted}
          className="flex items-center justify-center gap-2 rounded-2xl bg-teal-500 py-4 text-lg font-semibold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {currentStepIndex === steps.length - 1
            ? 'Complete Protocol'
            : 'Mark Complete & Next Step'}
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Floating AI chat button ──────────────────────────────────────── */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 shadow-lg transition hover:bg-teal-400"
        aria-label="Open AI assistant"
      >
        <MessageCircle size={24} className="text-white" />
      </button>

      {/* ── AI Chat panel ────────────────────────────────────────────────── */}
      <AIChat
        currentStep={currentStep.title}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  )
}
