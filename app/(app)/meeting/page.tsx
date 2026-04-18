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
import { toast } from 'sonner'
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

  const [sessions, setSessions] = useState<Session[]>([])
  const [statMap, setStatMap] = useState<Record<string, ProtocolStat>>({})
  const [workedProtocolIds, setWorkedProtocolIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([])
  const [generatingReport, setGeneratingReport] = useState(false)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [liveReport, setLiveReport] = useState('')

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)

  const [notes, setNotes] = useState('')
  const userRef = useRef<{ id: string; name: string } | null>(null)

  useEffect(() => {
    loadData()
    const saved = localStorage.getItem('benchly-meeting-notes')
    if (saved) setNotes(saved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profileData } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    userRef.current = {
      id: user.id,
      name: profileData?.full_name?.split(' ')[0] ?? 'there',
    }

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)

    try {
      const { data: reports } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(10)
      setWeeklyReports((reports as WeeklyReport[]) ?? [])
    } catch { /* table may not exist */ }

    if (!sessionData?.length) { setLoading(false); return }

    const protocolIds = Array.from(new Set(sessionData.map((s) => s.protocol_id)))

    const [{ data: protocolData }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('*').in('id', protocolIds),
      supabase.from('steps').select('id, protocol_id, step_number, title, instructions').in('protocol_id', protocolIds).order('step_number'),
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
        progressPct: pSteps.length > 0 ? Math.round((unique.length / pSteps.length) * 100) : 0,
      }
    }

    setSessions(sessionData)
    setStatMap(map)
    setWorkedProtocolIds(protocolIds)
    setSelectedIds(protocolIds)
    setLoading(false)
  }

  async function generateWeeklyReport() {
    const user = userRef.current
    if (!user) return
    setGeneratingReport(true)
    setLiveReport('')

    const { start, end } = getCurrentWeekBounds()
    const weekNum = getISOWeekNumber(start)

    const [{ data: weekSessions }, { data: weekSamples }, { data: weekLogs }] = await Promise.all([
      supabase.from('sessions').select('*, protocols(name)').eq('user_id', user.id).gte('last_updated', start.toISOString()).lte('last_updated', end.toISOString()),
      supabase.from('samples').select('tube_label, location, created_at').eq('user_id', user.id).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
      supabase.from('voice_logs').select('transcript, action_taken, type, created_at').eq('user_id', user.id).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).limit(40),
    ])

    const weekStr = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    const message = `You are generating a weekly lab meeting report for ${user.name}, a lab intern.\n\nWeek: ${weekStr}\n\nSESSIONS DATA:\n${JSON.stringify((weekSessions ?? []).map((s: Record<string, unknown>) => ({ protocol: (s.protocols as { name: string } | null)?.name ?? 'Unknown', current_step: s.current_step, completed_steps_count: (s.completed_steps as number[])?.length ?? 0, last_updated: s.last_updated })), null, 2)}\n\nSAMPLES LOGGED:\n${JSON.stringify(weekSamples ?? [], null, 2)}\n\nVOICE INTERACTIONS:\n${JSON.stringify((weekLogs ?? []).map((l: Record<string, unknown>) => ({ transcript: l.transcript, type: l.type, action: l.action_taken, date: (l.created_at as string)?.split('T')[0] })), null, 2)}\n\nGenerate a structured weekly lab report with exactly these sections:\n## Executive Summary\n## Daily Activity\n## Protocols Status\n## Sample Inventory\n## Key Observations\n## Next Steps\n\nBe specific, professional, and encouraging.`

    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, currentStep: 'Weekly Lab Report' }) })
    const data = await res.json()
    const content: string = data.reply ?? ''
    setLiveReport(content)

    try {
      const { data: saved } = await supabase.from('weekly_reports').insert({
        user_id: user.id, week_number: weekNum,
        week_start: start.toISOString().split('T')[0], week_end: end.toISOString().split('T')[0],
        report_content: content,
        raw_data: { sessions: weekSessions, samples: weekSamples, voice_logs: weekLogs },
      }).select().single()
      if (saved) { setWeeklyReports((prev) => [saved as WeeklyReport, ...prev]); setExpandedReportId((saved as WeeklyReport).id) }
    } catch { /* table not yet created */ }

    setGeneratingReport(false)
  }

  const cutoff = weekAgoISO()
  const thisWeekSessions = sessions.filter((s) => s.last_updated >= cutoff)
  const thisWeekProtocolIds = Array.from(new Set(thisWeekSessions.map((s) => s.protocol_id)))
  const thisWeekSteps = thisWeekSessions.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0)

  function toggleProtocol(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function generateSummary() {
    if (!selectedIds.length) return
    setGenerating(true)
    const details = selectedIds.map((id) => {
      const stat = statMap[id]
      if (!stat) return ''
      const completedTitles = stat.completedStepNumbers.map((n) => stat.steps.find((s) => s.step_number === n)?.title).filter(Boolean).join(', ')
      return `${stat.protocol.name}: completed steps — ${completedTitles || 'none recorded'}`
    })
    const protocolNames = selectedIds.map((id) => statMap[id]?.protocol.name).filter(Boolean).join(', ')
    const message = `The user is a lab intern preparing for their weekly lab meeting. They worked on the following protocols this week: ${protocolNames}. Their completed steps include: ${details.join('; ')}. Generate a professional but friendly lab meeting summary they can present. Include: what they worked on, key steps completed, any notable observations, and suggested next steps. Keep it under 200 words and make it presentation-ready.`
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, currentStep: 'Lab Meeting Prep' }) })
    const data = await res.json()
    setSummary(data.reply ?? '')
    setGenerating(false)
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    localStorage.setItem('benchly-meeting-notes', val)
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
  }

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
  const innerCardStyle = { background: '#0f0f0f', border: '1px solid var(--border)' }

  return (
    <div className="space-y-8">
      {/* ── Header + Generate ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>Lab Meeting</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>Weekly reports, protocol summaries, and meeting notes</p>
        </div>
        <button
          onClick={generateWeeklyReport}
          disabled={generatingReport}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
          style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          {generatingReport ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
          {generatingReport ? 'Generating…' : "This Week's Report"}
        </button>
      </div>

      {/* ── Live report ───────────────────────────────────────────────────── */}
      {liveReport && !weeklyReports.some((r) => r.report_content === liveReport) && (
        <div className="rounded-xl p-5" style={{ ...cardStyle, borderLeft: '2px solid var(--accent)' }}>
          <p className="mb-3" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>New Report — This Week</p>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{liveReport}</pre>
        </div>
      )}

      {/* ── Past weekly reports ───────────────────────────────────────────── */}
      {weeklyReports.length > 0 && (
        <div className="space-y-3">
          {weeklyReports.map((report) => {
            const isExpanded = expandedReportId === report.id
            return (
              <div key={report.id} className="rounded-xl overflow-hidden" style={cardStyle}>
                <button
                  onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                  className="flex w-full items-center justify-between px-5 py-4 transition-opacity hover:opacity-80"
                >
                  <div className="text-left">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      Week {report.week_number} — {fmtDate(report.week_start)} to {fmtDate(report.week_end)}
                    </p>
                    {!isExpanded && report.report_content && (
                      <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--text-muted)' }}>{report.report_content.slice(0, 120)}…</p>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                </button>
                {isExpanded && report.report_content && (
                  <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{report.report_content}</pre>
                    <button
                      onClick={() => { navigator.clipboard.writeText(report.report_content ?? ''); toast.success('Copied!') }}
                      className="mt-4 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-70"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                    >
                      <ClipboardCopy size={11} /> Copy
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {weeklyReports.length === 0 && !liveReport && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No weekly reports yet. Generate your first one above.</p>
      )}

      {/* ── Summary + Notes ───────────────────────────────────────────────── */}
      <div className="flex gap-6">
        {/* Left: Summary Generator */}
        <div className="flex w-3/5 flex-col gap-5">
          <div>
            <h2 className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>Quick Summary</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Select protocols to generate a meeting summary</p>
          </div>

          <div className="rounded-xl p-5" style={cardStyle}>
            {workedProtocolIds.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No protocols worked on yet — complete some steps first.</p>
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
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-opacity hover:opacity-80"
                      style={checked
                        ? { background: 'rgba(232,165,152,0.06)', border: '1px solid rgba(232,165,152,0.25)' }
                        : innerCardStyle}
                    >
                      {checked
                        ? <CheckSquare size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        : <Square size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                      <span className="text-sm" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {stat.protocol.name}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                        {stat.completedStepNumbers.length} step{stat.completedStepNumbers.length !== 1 ? 's' : ''}
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
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {generating ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : 'Generate Summary'}
          </button>

          {(summary || generating) && (
            <div className="flex flex-col gap-3">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={10}
                placeholder={generating ? 'Generating…' : ''}
                disabled={generating}
                className="resize-none rounded-xl px-5 py-4 text-sm leading-relaxed outline-none disabled:opacity-50"
                style={{ background: '#0f0f0f', border: '1px solid rgba(232,165,152,0.25)', color: 'var(--text-secondary)' }}
              />
              <div className="flex gap-2">
                {[
                  { icon: RefreshCw, label: 'Regenerate', onClick: generateSummary, disabled: generating },
                  { icon: ClipboardCopy, label: 'Copy', onClick: () => { navigator.clipboard.writeText(summary); toast.success('Copied!') }, disabled: !summary },
                  { icon: Download, label: 'Export PDF', onClick: () => toast('PDF export coming soon'), disabled: false },
                ].map(({ icon: Icon, label, onClick, disabled }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    disabled={disabled}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-30"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                  >
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Activity + Notes */}
        <div className="flex w-2/5 flex-col gap-5">
          <div className="rounded-xl p-5" style={cardStyle}>
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical size={14} style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>This Week at a Glance</h2>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={innerCardStyle}>
                <p className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>{thisWeekProtocolIds.length}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Protocol{thisWeekProtocolIds.length !== 1 ? 's' : ''} worked on</p>
              </div>
              <div className="rounded-lg p-3" style={innerCardStyle}>
                <p className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>{thisWeekSteps}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Steps completed</p>
              </div>
            </div>
            {workedProtocolIds.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity this week yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {workedProtocolIds.map((id) => {
                  const stat = statMap[id]
                  if (!stat) return null
                  return (
                    <div key={id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.protocol.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.completedStepNumbers.length}/{stat.steps.length}</span>
                      </div>
                      <div className="h-px w-full" style={{ background: 'var(--border)' }}>
                        <div className="h-px" style={{ width: `${stat.progressPct}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col rounded-xl p-5" style={cardStyle}>
            <h2 className="mb-1 text-sm" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>Notes</h2>
            <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>Jot down observations or questions — saved locally.</p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Write anything you want to mention at your meeting…"
              className="flex-1 resize-none rounded-lg px-4 py-3 text-sm outline-none"
              style={{ background: '#0f0f0f', border: '1px solid var(--border)', color: 'var(--text-secondary)', minHeight: 140 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
