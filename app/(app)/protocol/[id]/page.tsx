'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle, ChevronRight, Circle, ArrowRight, FlaskConical, List, X } from 'lucide-react'
import { toast } from 'sonner'
import { speakText } from '@/lib/speak'
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
  const [firstName, setFirstName] = useState('')
  const [showStepsSheet, setShowStepsSheet] = useState(false)

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

    const [{ data: protocolData }, { data: stepsData }, { data: profile }] = await Promise.all([
      supabase.from('protocols').select('*').eq('id', params.id).single(),
      supabase.from('steps').select('*').eq('protocol_id', params.id).order('step_number'),
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    ])

    if (!protocolData || !stepsData?.length) { setLoading(false); return }
    setProtocol(protocolData); setSteps(stepsData)

    const name = profile?.full_name?.split(' ')[0]
      || (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
      || user.email?.split('@')[0]
      || ''
    setFirstName(name)

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
      toast.success('Protocol complete! Well done.')
      speakText(`Protocol complete. Great work${firstName ? ' ' + firstName : ''}. You can now log your samples or start a new experiment.`)
    } else {
      const nextIndex = idx + 1
      setCurrentStepIndex(nextIndex)
      await saveSession(newCompleted, steps[nextIndex].step_number)
      toast.success('Step complete')
    }
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

  const currentStep = steps[currentStepIndex]
  const alreadyCompleted = completedSteps.includes(currentStep.step_number)
  const hasTimer = !!currentStep.timer_seconds
  const isLastStep = currentStepIndex === steps.length - 1

  const warningLower = currentStep.warning?.toLowerCase() || ''
  const showSampleLink = warningLower.includes('label') || warningLower.includes('sample id') || warningLower.includes('tube') || warningLower.includes('store')

  return (
    <>
    {/* Mobile step progress bar */}
    <div className="mb-4 flex items-center justify-between md:hidden">
      <div className="min-w-0">
        <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {protocol.name}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-px w-24 flex-shrink-0" style={{ background: 'var(--border)' }}>
            <div
              className="h-px"
              style={{
                width: `${Math.round((completedSteps.length / steps.length) * 100)}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {completedSteps.length}/{steps.length}
          </span>
        </div>
      </div>
      <button
        onClick={() => setShowStepsSheet(true)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-opacity hover:opacity-80"
        style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        <List size={12} /> Steps
      </button>
    </div>

    {/* Mobile steps bottom sheet */}
    <AnimatePresence>
      {showStepsSheet && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowStepsSheet(false)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl md:hidden"
            style={{ background: '#111111', border: '1px solid var(--border)', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {protocol.name}
              </p>
              <button onClick={() => setShowStepsSheet(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 overflow-y-auto p-3">
              {steps.map((step, idx) => {
                const isCompleted = completedSteps.includes(step.step_number)
                const isCurrent = idx === currentStepIndex
                return (
                  <button
                    key={step.id}
                    onClick={() => { setCurrentStepIndex(idx); setShowStepsSheet(false) }}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors w-full"
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
                      <p className="truncate text-sm" style={{ color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)', opacity: isCompleted || isCurrent ? 1 : 0.6, marginTop: 2 }}>
                        {step.title}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <div className="flex h-[calc(100vh-6rem)] gap-5">
      {/* ── Step list sidebar ────────────────────────────────────────────── */}
      <aside
        className="hidden w-64 flex-shrink-0 overflow-y-auto rounded-xl p-4 md:block"
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
              <button
                key={step.id}
                onClick={() => setCurrentStepIndex(idx)}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors text-left w-full"
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
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-32">

        {/* Completion banner */}
        {protocolComplete && (
          <div
            className="rounded-xl p-5"
            style={{ background: 'rgba(232,165,152,0.06)', border: '1px solid rgba(232,165,152,0.3)' }}
          >
            <p className="font-serif text-2xl font-normal italic" style={{ color: 'var(--accent)' }}>
              Protocol complete — great work{firstName ? `, ${firstName}` : ''}.
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {protocol.name} — all {steps.length} steps done. Your steps are still visible below for review.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => router.push('/samples')}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                <FlaskConical size={12} /> View Sample Tracker →
              </button>
              <button
                onClick={() => router.push('/protocol')}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                Start New Experiment
              </button>
            </div>
          </div>
        )}

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
          <>
            <div
              className="flex items-start gap-3 rounded-xl p-5"
              style={{ background: 'rgba(251,191,36,0.04)', borderLeft: '2px solid rgba(251,191,36,0.4)' }}
            >
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
              <p className="text-sm leading-relaxed" style={{ color: '#fcd34d' }}>{currentStep.warning}</p>
            </div>
            {showSampleLink && (
              <button
                onClick={() => router.push('/samples')}
                className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-80"
                style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.06em' }}
              >
                Log your samples <ArrowRight size={11} />
              </button>
            )}
          </>
        )}

        {/* Timer */}
        {hasTimer && (
          <Timer key={currentStep.id} ref={timerRef} seconds={currentStep.timer_seconds!} onComplete={notifyTimerComplete} />
        )}

        {/* Mark Complete / Complete Protocol */}
        {!protocolComplete && (
          <button
            onClick={handleCompleteStep}
            disabled={alreadyCompleted}
            className="flex items-center justify-center gap-2 rounded-xl py-4 text-sm transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 11 }}
          >
            {isLastStep ? 'Complete Protocol ✓' : 'Mark Complete'}
            {!isLastStep && <ChevronRight size={14} />}
          </button>
        )}
      </div>
    </div>
    </>
  )
}
