'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
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

export default function DashboardTasks({
  sessionId,
  protocolId,
  protocolName,
  steps,
  completedStepNumbers,
}: Props) {
  const supabase = createSupabaseBrowserClient()
  const [completed, setCompleted] = useState<number[]>(completedStepNumbers)
  const [saving, setSaving] = useState<number | null>(null)

  const remaining = steps.filter((s) => !completed.includes(s.step_number))
  const allDone = remaining.length === 0
  const progressPct = Math.round((completed.length / steps.length) * 100)

  async function markComplete(stepNum: number) {
    if (saving !== null) return
    setSaving(stepNum)
    const next = [...completed, stepNum]
    setCompleted(next)
    try {
      const nextStep = steps.find((s) => !next.includes(s.step_number))
      await supabase
        .from('sessions')
        .update({
          completed_steps: next,
          current_step: nextStep?.step_number ?? stepNum,
          last_updated: new Date().toISOString(),
        })
        .eq('id', sessionId)
    } catch {
      // revert on error
      setCompleted((prev) => prev.filter((n) => n !== stepNum))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-2xl bg-[#152235] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-white">Today&apos;s Tasks</h3>
        <span className="text-xs text-slate-400">{protocolName}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{completed.length}/{steps.length} steps</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700">
          <div
            className="h-1.5 rounded-full bg-teal-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {allDone ? (
        <p className="py-2 text-sm text-teal-400">All steps completed! 🎉</p>
      ) : (
        <ul className="space-y-2">
          {remaining.slice(0, 6).map((step) => (
            <li key={step.id} className="flex items-center gap-3">
              <button
                onClick={() => markComplete(step.step_number)}
                disabled={saving === step.step_number}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-slate-600 text-teal-400 transition hover:border-teal-400 disabled:opacity-50"
                aria-label={`Mark step ${step.step_number} complete`}
              >
                {saving === step.step_number && (
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-teal-400 border-t-transparent" />
                )}
              </button>
              <span className="text-sm text-slate-300">
                <span className="text-slate-500 mr-1">Step {step.step_number}.</span>
                {step.title}
              </span>
            </li>
          ))}
          {remaining.length > 6 && (
            <li className="text-xs text-slate-500 pl-8">
              +{remaining.length - 6} more steps
            </li>
          )}
        </ul>
      )}

      <Link
        href={`/protocol/${protocolId}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500/10 py-2.5 text-sm font-medium text-teal-400 transition hover:bg-teal-500/20"
      >
        Continue Protocol <ArrowRight size={14} />
      </Link>
    </div>
  )
}
