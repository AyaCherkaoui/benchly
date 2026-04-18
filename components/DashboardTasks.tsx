'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase'

interface Step {
  id: string
  step_number: number
  title: string
}

interface Props {
  sessionId: string
  protocolId: string
  protocolName: string
  steps: Step[]
  completedStepNumbers: number[]
}

export default function DashboardTasks({ sessionId, protocolId, steps, completedStepNumbers }: Props) {
  const supabase = createSupabaseBrowserClient()
  const [completed, setCompleted] = useState<number[]>(completedStepNumbers)
  const [saving, setSaving] = useState<number | null>(null)

  const remaining = steps.filter((s) => !completed.includes(s.step_number))
  const allDone = remaining.length === 0

  async function markComplete(stepNum: number) {
    if (saving !== null) return
    setSaving(stepNum)
    const next = [...completed, stepNum]
    setCompleted(next)
    try {
      const nextStep = steps.find((s) => !next.includes(s.step_number))
      await supabase.from('sessions').update({
        completed_steps: next,
        current_step: nextStep?.step_number ?? stepNum,
        last_updated: new Date().toISOString(),
      }).eq('id', sessionId)
      toast.success('Step complete')
    } catch {
      setCompleted((prev) => prev.filter((n) => n !== stepNum))
      toast.error('Failed to save')
    } finally {
      setSaving(null)
    }
  }

  if (allDone) {
    return <p className="text-sm" style={{ color: 'var(--accent)' }}>All steps complete 🎉</p>
  }

  return (
    <div className="space-y-3">
      {remaining.slice(0, 5).map((step) => (
        <div key={step.id} className="flex items-start gap-3">
          <button
            onClick={() => markComplete(step.step_number)}
            disabled={saving === step.step_number}
            className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ border: '1.5px solid var(--accent)' }}
            aria-label={`Mark step ${step.step_number} complete`}
          >
            {saving === step.step_number && (
              <div className="h-2 w-2 animate-spin rounded-full" style={{ border: '1px solid var(--accent)', borderTopColor: 'transparent' }} />
            )}
          </button>
          <span className="text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {step.title}
          </span>
        </div>
      ))}
      {remaining.length > 5 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', paddingLeft: 28 }}>
          +{remaining.length - 5} more
        </p>
      )}
      <div style={{ paddingTop: 4 }}>
        <Link
          href={`/protocol/${protocolId}`}
          className="text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent)', letterSpacing: '0.06em' }}
        >
          + Continue in protocol →
        </Link>
      </div>
    </div>
  )
}
