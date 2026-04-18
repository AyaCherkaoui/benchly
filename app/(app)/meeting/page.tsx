'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
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

interface WeeklyReport {
  id: string
  week_number: number
  week_start: string
  week_end: string
  report_content: string | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weekAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function getCurrentWeekBounds(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay()
  const daysToMon = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - daysToMon)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MeetingPage() {
  const supabase = createSupabaseBrowserClient()

  // Protocol data
  const [sessions, setSessions] = useState<Session[]>([])
  const [statMap, setStatMap] = useState<Record<string, ProtocolStat>>({})
  const [workedProtocolIds, setWorkedProtocolIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Weekly reports
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([])
  const [generatingReport, setGeneratingReport] = useState(false)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [liveReport, setLiveReport] = useState('')

  // Summary generator
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)

  // Toast
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Notes (localStorage)
  const [notes, setNotes] = useState('')

  // Current user
  const userRef = useRef<{ id: string; name: string } | null>(null)

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

    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    userRef.current = {
      id: user.id,
      name: profileData?.full_name?.split(' ')[0] ?? 'Lab Intern',
    }

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)

    // Load weekly reports (gracefully handle missing table)
    try {
      const { data: reports } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(10)
      setWeeklyReports((reports as WeeklyReport[]) ?? [])
    } catch {
      // Table may not exist yet
    }

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

    const map: Record<string, ProtocolStat> = {}
    for (const protocol of protocolData ?? []) {
      const pSteps = (stepsData ?? []).filter((s) => s.protocol_id === protocol.id)
      const pSessions = sessionData.filter((s) => s.protocol_id === protocol.id)
      const allCompleted = pSessions.flatMap((s) => s.completed_steps ?? [])
      const unique = Array.from(new Set(allCompleted)) as number[]
      map[protocol.id] = {
        protocol,
        steps: pSteps,
        completedStepNumbers: unique,
        progressPct:
          pSteps.length > 0 ? Math.round((unique.length / pSteps.length) * 100) : 0,
      }
    }

    setSessions(sessionData)
    setStatMap(map)
    setWorkedProtocolIds(protocolIds)
    setSelectedIds(protocolIds)
    setLoading(false)
  }

  // ─── Weekly report generation ───────────────────────────────────────────────

  async function generateWeeklyReport() {
    const user = userRef.current
    if (!user) return
    setGeneratingReport(true)
    setLiveReport('')

    const { start, end } = getCurrentWeekBounds()
    const startISO = start.toISOString()
    const endISO = end.toISOString()
    const weekNum = getISOWeekNumber(start)

    // Fetch this week's data
    const [{ data: weekSessions }, { data: weekSamples }, { data: weekLogs }] =
      await Promise.all([
        supabase
          .from('sessions')
          .select('*, protocols(name)')
          .eq('user_id', user.id)
          .gte('last_updated', startISO)
          .lte('last_updated', endISO),
        supabase
          .from('samples')
          .select('tube_label, location, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('voice_logs')
          .select('transcript, action_taken, type, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(40),
      ])

    const weekStr = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    const message = `You are generating a weekly lab meeting report for ${user.name}, a lab intern.

Week: ${weekStr}

SESSIONS DATA:
${JSON.stringify(
  (weekSessions ?? []).map((s: Record<string, unknown>) => ({
    protocol: (s.protocols as { name: string } | null)?.name ?? 'Unknown',
    current_step: s.current_step,
    completed_steps_count: (s.completed_steps as number[])?.length ?? 0,
    last_updated: s.last_updated,
  })),
  null,
  2
)}

SAMPLES LOGGED:
${JSON.stringify(weekSamples ?? [], null, 2)}

VOICE INTERACTIONS (observations, questions, commands):
${JSON.stringify(
  (weekLogs ?? []).map((l: Record<string, unknown>) => ({
    transcript: l.transcript,
    type: l.type,
    action: l.action_taken,
    date: (l.created_at as string)?.split('T')[0],
  })),
  null,
  2
)}

Generate a structured weekly lab report with exactly these sections:
## Executive Summary
## Daily Activity
## Protocols Status
## Sample Inventory
## Key Observations
## Next Steps

Be specific, professional, and encouraging. Reference actual data from above.`

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, currentStep: 'Weekly Lab Report' }),
    })
    const data = await res.json()
    const content: string = data.reply ?? ''

    setLiveReport(content)

    // Save to weekly_reports (gracefully handle missing table)
    try {
      const { data: saved } = await supabase
        .from('weekly_reports')
        .insert({
          user_id: user.id,
          week_number: weekNum,
          week_start: start.toISOString().split('T')[0],
          week_end: end.toISOString().split('T')[0],
          report_content: content,
          raw_data: { sessions: weekSessions, samples: weekSamples, voice_logs: weekLogs },
        })
        .select()
        .single()

      if (saved) {
        setWeeklyReports((prev) => [saved as WeeklyReport, ...prev])
        setExpandedReportId((saved as WeeklyReport).id)
      }
    } catch {
      // Table not yet created — report still shows inline
    }

    setGeneratingReport(false)
  }

  // ─── This-week stats ────────────────────────────────────────────────────────
  const cutoff = weekAgoISO()
  const thisWeekSessions = sessions.filter((s) => s.last_updated >= cutoff)
  const thisWeekProtocolIds = Array.from(new Set(thisWeekSessions.map((s) => s.protocol_id)))
  const thisWeekSteps = thisWeekSessions.reduce(
    (acc, s) => acc + (s.completed_steps?.length ?? 0),
    0
  )

  function toggleProtocol(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

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

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  function copyToClipboard() {
    if (!summary) return
    navigator.clipboard.writeText(summary).then(() => showToast('Copied to clipboard!'))
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    localStorage.setItem('benchly-meeting-notes', val)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400">Loading your activity…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Weekly Reports ───────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Lab Meeting Prep</h1>
            <p className="mt-1 text-sm text-slate-400">
              Weekly reports, protocol summaries, and meeting notes
            </p>
          </div>
          <button
            onClick={generateWeeklyReport}
            disabled={generatingReport}
            className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
          >
            {generatingReport ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FlaskConical size={15} />
            )}
            {generatingReport ? 'Generating…' : "Generate This Week's Report"}
          </button>
        </div>

        {/* Live / just-generated report (before save) */}
        {liveReport && !weeklyReports.some((r) => r.report_content === liveReport) && (
          <div className="mb-4 rounded-2xl bg-[#152235] p-5 ring-1 ring-teal-500/30">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-400">
              New Report — This Week
            </p>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
              {liveReport}
            </pre>
          </div>
        )}

        {/* Past weekly report cards */}
        {weeklyReports.length > 0 ? (
          <div className="space-y-3">
            {weeklyReports.map((report) => {
              const isExpanded = expandedReportId === report.id
              return (
                <div
                  key={report.id}
                  className="rounded-2xl bg-[#152235] ring-1 ring-slate-700/50"
                >
                  <button
                    onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                    className="flex w-full items-center justify-between px-5 py-4"
                  >
                    <div className="text-left">
                      <p className="font-semibold text-white">
                        Week {report.week_number} — {fmtDate(report.week_start)} to{' '}
                        {fmtDate(report.week_end)}
                      </p>
                      {!isExpanded && report.report_content && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-slate-400">
                          {report.report_content.slice(0, 120)}…
                        </p>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} className="flex-shrink-0 text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="flex-shrink-0 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && report.report_content && (
                    <div className="border-t border-slate-700/50 px-5 pb-5 pt-4">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                        {report.report_content}
                      </pre>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(report.report_content ?? '')
                            showToast('Copied!')
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600"
                        >
                          <ClipboardCopy size={12} /> Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No weekly reports yet.{' '}
            {weeklyReports.length === 0 &&
              'Run the SQL migration in supabase/migrations/20260417_weekly_reports.sql first, then generate your first report.'}
          </p>
        )}
      </div>

      {/* ── Original summary + notes layout ─────────────────────────────────── */}
      <div className="flex h-full gap-6">
        {/* Left: Summary Generator (60%) */}
        <div className="flex w-3/5 flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold text-white">Quick Meeting Summary</h2>
            <p className="mt-1 text-sm text-slate-400">
              Generate a short summary to present at your lab meeting
            </p>
          </div>

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
              <div className="flex gap-3">
                <button
                  onClick={generateSummary}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  <RefreshCw size={14} /> Regenerate
                </button>
                <button
                  onClick={copyToClipboard}
                  disabled={!summary}
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  <ClipboardCopy size={14} /> Copy to Clipboard
                </button>
                <button
                  onClick={() => showToast('PDF export coming soon')}
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                >
                  <Download size={14} /> Export as PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Activity + Notes (40%) */}
        <div className="flex w-2/5 flex-col gap-5">
          <div className="rounded-2xl bg-[#152235] p-5">
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical size={16} className="text-teal-400" />
              <h2 className="font-semibold text-white">This Week at a Glance</h2>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-800/50 p-3">
                <p className="text-2xl font-bold text-white">{thisWeekProtocolIds.length}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Protocol{thisWeekProtocolIds.length !== 1 ? 's' : ''} worked on
                </p>
              </div>
              <div className="rounded-xl bg-slate-800/50 p-3">
                <p className="text-2xl font-bold text-white">{thisWeekSteps}</p>
                <p className="mt-0.5 text-xs text-slate-400">Steps completed</p>
              </div>
            </div>
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
                        <span className="font-medium text-slate-300">{stat.protocol.name}</span>
                        <span className="text-slate-500">
                          {stat.completedStepNumbers.length}/{stat.steps.length} steps
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700">
                        <div
                          className="h-2 rounded-full bg-teal-500 transition-all"
                          style={{ width: `${stat.progressPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right text-xs text-slate-500">{stat.progressPct}%</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col rounded-2xl bg-[#152235] p-5">
            <h2 className="mb-3 font-semibold text-white">Notes</h2>
            <p className="mb-3 text-xs text-slate-500">
              Jot down observations, questions, or ideas — saved locally.
            </p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Write anything you want to remember or mention at your meeting…"
              className="flex-1 resize-none rounded-xl bg-[#0d1b2a] px-4 py-3 text-sm text-slate-200 outline-none placeholder-slate-600 ring-1 ring-slate-700 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-5 py-3 text-sm font-medium text-white shadow-xl ring-1 ring-slate-700">
          {toast}
        </div>
      )}
    </div>
  )
}
