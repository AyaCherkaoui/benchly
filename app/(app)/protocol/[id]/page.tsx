'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle, ChevronRight, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import Timer, { TimerHandle } from '@/components/Timer'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'
import { Protocol, Step } from '@/types'

export default function ProtocolWalkerPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const { setSessionState, setCallbacks, clearSession, notifyTimerComplete } = useProtocolSession()

  const [protocol, setProtocol] = useState<Protocol | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [protocolComplete, setProtocolComplete] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [loading, setLoading] = useState(true)

  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId
  const stepsRef = useRef<Step[]>(steps)
  stepsRef.current = steps
  const currentStepIndexRef = useRef(currentStepIndex)
  currentStepIndexRef.current = currentStepIndex
  const completedStepsRef = useRef<number[]>(completedSteps)
  completedStepsRef.current = completedSteps
  const timerRef = useRef<TimerHandle>(null)

  const loadProtocol = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: protocolData }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('*').eq('id', params.id).single(),
      supabase.from('steps').select('*').eq('protocol_id', params.id).order('step_number'),
    ])

    if (!protocolData || !stepsData?.length) { setLoading(false); return }
    setProtocol(protocolData); setSteps(stepsData)

    const { data: existingSession } = await supabase
      .from('sessions').select('*').eq('user_id', user.id).eq('protocol_id', params.id)
      .order('last_updated', { ascending: false }).limit(1).maybeSingle()

    if (existingSession) {
      setSessionId(existingSession.id); sessionIdRef.current = existingSession.id
      const completed: number[] = existingSession.completed_steps ?? []
      setCompletedSteps(completed)
      const idx = stepsData.findIndex((s) => s.step_number === existingSession.current_step)
      setCurrentStepIndex(idx >= 0 ? idx : 0)
    }
    setLoading(false)
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadProtocol() }, [loadProtocol])

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

  useEffect(() => {
    if (protocol && steps.length) setSessionState({ protocol, steps, currentStepIndex })
  }, [protocol, steps, currentStepIndex, setSessionState])

  async function saveSession(completed: number[], currentStepNumber: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (sessionIdRef.current) {
      await supabase.from('sessions').update({
        current_step: currentStepNumber,
        completed_steps: completed,
        last_updated: new Date().toISOString(),
      }).eq('id', sessionIdRef.current)
    } else {
      const { data } = await supabase.from('sessions').insert({
        user_id: user.id,
        protocol_id: params.id,
        current_step: currentStepNumber,
        completed_steps: completed,
        started_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      }).select().single()
      if (data) { setSessionId(data.id); sessionIdRef.current = data.id }
    }

    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
    toast.success('Session saved')
  }

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
    toast.success('Step complete')
  }

  function handleNextStep() {
    const steps = stepsRef.current
    const idx = currentStepIndexRef.current
    if (idx < steps.length - 1) setCurrentStepIndex(idx + 1)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!protocol || !steps.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Protocol not found.</p>
      </div>
    )
  }

  if (protocolComplete) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>
          Protocol Complete
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>{protocol.name} — all {steps.length} steps done</p>
        <button
          onClick={() => router.push('/protocol')}
          className="rounded-lg px-6 py-2.5 text-sm transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}
        >
          Back to Protocols
        </button>
      </div>
    )
  }

  const currentStep = steps[currentStepIndex]
  const alreadyCompleted = completedSteps.includes(currentStep.step_number)
  const hasTimer = !!currentStep.timer_seconds

  return (
    <div className="flex h-[calc(100vh-6.5rem)] gap-5">
      {/* ── Step list sidebar ────────────────────────────────────────────── */}
      <aside
        className="w-64 flex-shrink-0 overflow-y-auto rounded-xl p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <p className="mb-4" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {protocol.name}
        </p>
        <div className="flex flex-col gap-0.5">
          {steps.map((step, idx) => {
            const isCompleted = completedSteps.includes(step.step_number)
            const isCurrent = idx === currentStepIndex
            return (
              <div
                key={step.id}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors"
                style={isCurrent
                  ? { background: 'rgba(232,165,152,0.06)', borderLeft: '2px solid var(--accent)' }
                  : { borderLeft: '2px solid transparent' }
                }
              >
                {isCompleted ? (
                  <CheckCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                ) : (
                  <Circle size={14} className="mt-0.5 flex-shrink-0" style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-muted)', opacity: isCurrent ? 1 : 0.4 }} />
                )}
                <div className="min-w-0">
                  <p style={{ fontSize: 10, color: isCurrent ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '0.06em' }}>
                    Step {step.step_number}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: isCurrent ? 'var(--text-primary)' : isCompleted ? 'var(--text-muted)' : 'var(--text-muted)', opacity: isCompleted || isCurrent ? 1 : 0.5, marginTop: 1 }}
                  >
                    {step.title}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {/* Step header */}
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Step {currentStep.step_number} of {steps.length}
            </p>
            <h1 className="mt-1 font-serif text-3xl italic font-normal" style={{ color: 'var(--text-primary)' }}>
              {currentStep.title}
            </h1>
          </div>
          <div
            className="text-xs transition-opacity duration-300"
            style={{ color: 'var(--accent)', opacity: savedIndicator ? 1 : 0, letterSpacing: '0.06em' }}
          >
            Saved ✓
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="whitespace-pre-line leading-relaxed text-sm" style={{ color: 'var(--text-secondary)' }}>
            {currentStep.instructions}
          </p>
        </div>

        {/* Warning */}
        {currentStep.warning && (
          <div
            className="flex items-start gap-3 rounded-xl p-5"
            style={{ background: 'rgba(251,191,36,0.04)', borderLeft: '2px solid rgba(251,191,36,0.4)' }}
          >
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
            <p className="text-sm leading-relaxed" style={{ color: '#fcd34d' }}>{currentStep.warning}</p>
          </div>
        )}

        {/* Timer */}
        {hasTimer && (
          <Timer key={currentStep.id} ref={timerRef} seconds={currentStep.timer_seconds!} onComplete={notifyTimerComplete} />
        )}

        {/* Mark Complete */}
        <button
          onClick={handleCompleteStep}
          disabled={alreadyCompleted}
          className="flex items-center justify-center gap-2 rounded-xl py-4 text-sm transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 11 }}
        >
          {currentStepIndex === steps.length - 1 ? 'Complete Protocol' : 'Mark Complete'}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
