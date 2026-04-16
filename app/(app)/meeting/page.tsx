'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckSquare,
  ClipboardCopy,
  Download,
  FlaskConical,
  Loader2,
  RefreshCw,
  Square,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Protocol, Session, Step } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProtocolStat {
  protocol: Protocol
  steps: Step[]
  completedStepNumbers: number[]
  progressPct: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weekAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MeetingPage() {
  const supabase = createSupabaseBrowserClient()

  // Data
  const [sessions, setSessions] = useState<Session[]>([])
  const [statMap, setStatMap] = useState<Record<string, ProtocolStat>>({})
  const [workedProtocolIds, setWorkedProtocolIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Summary generator
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)

  // Toast
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Notes (localStorage)
  const [notes, setNotes] = useState('')

  // ─── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData()
    const saved = localStorage.getItem('benchly-meeting-notes')
    if (saved) setNotes(saved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)

    if (!sessionData?.length) {
      setLoading(false)
      return
    }

    const protocolIds = Array.from(new Set(sessionData.map((s) => s.protocol_id)))

    const [{ data: protocolData }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('*').in('id', protocolIds),
      supabase
        .from('steps')
        .select('id, protocol_id, step_number, title, instructions')
        .in('protocol_id', protocolIds)
        .order('step_number'),
    ])

    // Build stat map
    const map: Record<string, ProtocolStat> = {}
    for (const protocol of protocolData ?? []) {
      const pSteps = (stepsData ?? []).filter(
        (s) => s.protocol_id === protocol.id
      )
      const pSessions = sessionData.filter((s) => s.protocol_id === protocol.id)
      const allCompleted = pSessions.flatMap((s) => s.completed_steps ?? [])
      const unique = Array.from(new Set(allCompleted)) as number[]
      map[protocol.id] = {
        protocol,
        steps: pSteps,
        completedStepNumbers: unique,
        progressPct:
          pSteps.length > 0
            ? Math.round((unique.length / pSteps.length) * 100)
            : 0,
      }
    }

    setSessions(sessionData)
    setStatMap(map)
    setWorkedProtocolIds(protocolIds)
    // Default: select all protocols
    setSelectedIds(protocolIds)
    setLoading(false)
  }

  // ─── This-week stats ────────────────────────────────────────────────────────
  const cutoff = weekAgoISO()
  const thisWeekSessions = sessions.filter((s) => s.last_updated >= cutoff)
  const thisWeekProtocolIds = Array.from(
    new Set(thisWeekSessions.map((s) => s.protocol_id))
  )
  const thisWeekSteps = thisWeekSessions.reduce(
    (acc, s) => acc + (s.completed_steps?.length ?? 0),
    0
  )

  // ─── Multi-select toggle ────────────────────────────────────────────────────
  function toggleProtocol(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  // ─── Summary generation ─────────────────────────────────────────────────────
  async function generateSummary() {
    if (!selectedIds.length) return
    setGenerating(true)

    const details = selectedIds.map((id) => {
      const stat = statMap[id]
      if (!stat) return ''
      const completedTitles = stat.completedStepNumbers
        .map((n) => stat.steps.find((s) => s.step_number === n)?.title)
        .filter(Boolean)
        .join(', ')
      return `${stat.protocol.name}: completed steps — ${completedTitles || 'none recorded'}`
    })

    const protocolNames = selectedIds
      .map((id) => statMap[id]?.protocol.name)
      .filter(Boolean)
      .join(', ')

    const message = `The user is a lab intern preparing for their weekly lab meeting. They worked on the following protocols this week: ${protocolNames}. Their completed steps include: ${details.join('; ')}. Generate a professional but friendly lab meeting summary they can present. Include: what they worked on, key steps completed, any notable observations, and suggested next steps. Keep it under 200 words and make it presentation-ready.`

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, currentStep: 'Lab Meeting Prep' }),
    })
    const data = await res.json()
    setSummary(data.reply ?? '')
    setGenerating(false)
  }

  // ─── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  function copyToClipboard() {
    if (!summary) return
    navigator.clipboard.writeText(summary).then(() => showToast('Copied to clipboard!'))
  }

  // ─── Notes ──────────────────────────────────────────────────────────────────
  function handleNotesChange(val: string) {
    setNotes(val)
    localStorage.setItem('benchly-meeting-notes', val)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400">Loading your activity…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-6">
      {/* ── Left: Summary Generator (60%) ──────────────────────────────────── */}
      <div className="flex w-3/5 flex-col gap-5">
        <div>
          <h1 className="text-3xl font-bold text-white">Lab Meeting Prep</h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate a summary of your week&apos;s work to present at your lab
            meeting
          </p>
        </div>

        {/* Protocol multi-select */}
        <div className="rounded-2xl bg-[#152235] p-5">
          <p className="mb-3 text-sm font-semibold text-slate-300">
            Select protocols to include
          </p>

          {workedProtocolIds.length === 0 ? (
            <p className="text-sm text-slate-500">
              No protocols worked on yet — complete some steps first!
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {workedProtocolIds.map((id) => {
                const stat = statMap[id]
                if (!stat) return null
                const checked = selectedIds.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleProtocol(id)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                      checked
                        ? 'bg-teal-500/10 ring-1 ring-teal-500/30'
                        : 'bg-slate-800/40 ring-1 ring-slate-700/50 hover:ring-slate-600'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare size={16} className="flex-shrink-0 text-teal-400" />
                    ) : (
                      <Square size={16} className="flex-shrink-0 text-slate-500" />
                    )}
                    <span className={`text-sm font-medium ${checked ? 'text-white' : 'text-slate-400'}`}>
                      {stat.protocol.name}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {stat.completedStepNumbers.length} step
                      {stat.completedStepNumbers.length !== 1 ? 's' : ''} done
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={generateSummary}
          disabled={generating || selectedIds.length === 0}
          className="flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generating…
            </>
          ) : (
            'Generate Summary'
          )}
        </button>

        {/* Summary output */}
        {(summary || generating) && (
          <div className="flex flex-col gap-3">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={10}
              placeholder={generating ? 'Generating your summary…' : ''}
              disabled={generating}
              className="resize-none rounded-2xl bg-[#152235] px-5 py-4 text-sm leading-relaxed text-slate-100 outline-none ring-2 ring-teal-500/40 placeholder-slate-500 focus:ring-teal-500/70 disabled:opacity-60"
            />

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={generateSummary}
                disabled={generating}
                className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
              <button
                onClick={copyToClipboard}
                disabled={!summary}
                className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
              >
                <ClipboardCopy size={14} />
                Copy to Clipboard
              </button>
              <button
                onClick={() => showToast('PDF export coming soon')}
                className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                <Download size={14} />
                Export as PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Activity + Notes (40%) ───────────────────────────────────── */}
      <div className="flex w-2/5 flex-col gap-5">
        {/* This Week at a Glance */}
        <div className="rounded-2xl bg-[#152235] p-5">
          <div className="mb-4 flex items-center gap-2">
            <FlaskConical size={16} className="text-teal-400" />
            <h2 className="font-semibold text-white">This Week at a Glance</h2>
          </div>

          {/* Quick stats */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-800/50 p-3">
              <p className="text-2xl font-bold text-white">
                {thisWeekProtocolIds.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Protocol{thisWeekProtocolIds.length !== 1 ? 's' : ''} worked on
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/50 p-3">
              <p className="text-2xl font-bold text-white">{thisWeekSteps}</p>
              <p className="mt-0.5 text-xs text-slate-400">Steps completed</p>
            </div>
          </div>

          {/* Per-protocol progress bars */}
          {workedProtocolIds.length === 0 ? (
            <p className="text-sm text-slate-500">No activity this week yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {workedProtocolIds.map((id) => {
                const stat = statMap[id]
                if (!stat) return null
                return (
                  <div key={id}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">
                        {stat.protocol.name}
                      </span>
                      <span className="text-slate-500">
                        {stat.completedStepNumbers.length}/
                        {stat.steps.length} steps
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-700">
                      <div
                        className="h-2 rounded-full bg-teal-500 transition-all"
                        style={{ width: `${stat.progressPct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs text-slate-500">
                      {stat.progressPct}%
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-1 flex-col rounded-2xl bg-[#152235] p-5">
          <h2 className="mb-3 font-semibold text-white">Notes</h2>
          <p className="mb-3 text-xs text-slate-500">
            Jot down observations, questions, or ideas — saved locally in your browser.
          </p>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Write anything you want to remember or mention at your meeting…"
            className="flex-1 resize-none rounded-xl bg-[#0d1b2a] px-4 py-3 text-sm text-slate-200 outline-none placeholder-slate-600 ring-1 ring-slate-700 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl ring-1 ring-slate-700">
          {toast}
        </div>
      )}
    </div>
  )
}
