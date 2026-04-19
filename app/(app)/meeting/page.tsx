'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardCopy, FlaskConical, Loader2, Upload, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Protocol, Session, Step } from '@/types'

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

interface UploadedFile {
  name: string
  type: string
  url: string
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

function weekAgoISO() {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtWeek(start: string, end: string) {
  return `Week of ${fmtDate(start)} – ${fmtDate(end)}`
}

export default function MeetingPage() {
  const supabase = createSupabaseBrowserClient()
  const userRef = useRef<{ id: string; name: string } | null>(null)

  const [sessions, setSessions] = useState<Session[]>([])
  const [statMap, setStatMap] = useState<Record<string, ProtocolStat>>({})
  const [workedProtocolIds, setWorkedProtocolIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([])
  const [generatingReport, setGeneratingReport] = useState(false)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [liveReport, setLiveReport] = useState('')

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profileData } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    userRef.current = { id: user.id, name: profileData?.full_name?.split(' ')[0] ?? 'there' }

    const { data: sessionData } = await supabase.from('sessions').select('*').eq('user_id', user.id)

    try {
      const { data: reports } = await supabase.from('weekly_reports').select('*').eq('user_id', user.id).order('week_start', { ascending: false }).limit(20)
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
      map[protocol.id] = { protocol, steps: pSteps, completedStepNumbers: unique, progressPct: pSteps.length > 0 ? Math.round((unique.length / pSteps.length) * 100) : 0 }
    }

    setSessions(sessionData)
    setStatMap(map)
    setWorkedProtocolIds(protocolIds)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file)
      setUploadedFiles((prev) => [...prev, { name: file.name, type: file.type, url }])
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function removeFile(name: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function generateWeeklyReport() {
    const user = userRef.current
    if (!user) return
    setGeneratingReport(true); setLiveReport('')

    const { start, end } = getCurrentWeekBounds()
    const weekNum = getISOWeekNumber(start)

    const [{ data: weekSessions }, { data: weekSamples }, { data: weekLogs }] = await Promise.all([
      supabase.from('sessions').select('*, protocols(name)').eq('user_id', user.id).gte('last_updated', start.toISOString()).lte('last_updated', end.toISOString()),
      supabase.from('samples').select('tube_label, location, created_at').eq('user_id', user.id).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
      supabase.from('voice_logs').select('transcript, action_taken, type, created_at').eq('user_id', user.id).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).limit(40),
    ])

    const weekStr = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    const fileNames = uploadedFiles.map((f) => f.name).join(', ')

    const message = `You are generating a weekly lab meeting report for ${user.name}.

Week: ${weekStr}
${fileNames ? `Results uploaded this week: ${fileNames}. Please reference these results in your summary.` : ''}

SESSIONS:\n${JSON.stringify((weekSessions ?? []).map((s: Record<string, unknown>) => ({ protocol: (s.protocols as { name: string } | null)?.name, current_step: s.current_step, steps_done: (s.completed_steps as number[])?.length ?? 0 })), null, 2)}

SAMPLES:\n${JSON.stringify(weekSamples ?? [], null, 2)}

VOICE INTERACTIONS:\n${JSON.stringify((weekLogs ?? []).map((l: Record<string, unknown>) => ({ transcript: l.transcript, type: l.type, date: (l.created_at as string)?.split('T')[0] })), null, 2)}

Generate a structured weekly lab report with exactly these sections:
## Executive Summary
## Daily Activity
## Protocols Status
## Sample Inventory
## Key Observations
## Next Steps

Be specific, professional, and encouraging. Write in plain prose. No bullet dashes, no markdown asterisks.`

    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, currentStep: 'Weekly Lab Report' }) })
    const data = await res.json()
    const content: string = data.reply ?? ''
    setLiveReport(content)

    try {
      const { data: saved } = await supabase.from('weekly_reports').insert({
        user_id: user.id, week_number: weekNum,
        week_start: start.toISOString().split('T')[0], week_end: end.toISOString().split('T')[0],
        report_content: content,
        raw_data: { sessions: weekSessions, samples: weekSamples, voice_logs: weekLogs, files: fileNames },
      }).select().single()
      if (saved) {
        setWeeklyReports((prev) => [saved as WeeklyReport, ...prev])
        setExpandedReportId((saved as WeeklyReport).id)
        toast.success('Report saved')
      }
    } catch { /* table not yet created */ }

    setGeneratingReport(false)
  }

  const cutoff = weekAgoISO()
  const thisWeekSessions = sessions.filter((s) => s.last_updated >= cutoff)
  const thisWeekProtocolIds = Array.from(new Set(thisWeekSessions.map((s) => s.protocol_id)))
  const thisWeekSteps = thisWeekSessions.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0)

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
  }

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' }
  const innerCard = { background: '#0f0f0f', border: '1px solid var(--border)' }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>Lab Meeting</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>Weekly reports and experiment summaries</p>
        </div>
        <button
          onClick={generateWeeklyReport}
          disabled={generatingReport}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-30 w-full sm:w-auto justify-center"
          style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          {generatingReport ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
          {generatingReport ? 'Generating…' : "Generate This Week's Report"}
        </button>
      </div>

      {/* Main layout: content + sidebar */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: report + results */}
        <div className="flex-1 space-y-6">

          {/* Results upload */}
          <div className="rounded-xl p-6 space-y-4" style={cardStyle}>
            <div>
              <h2 className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>Results</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Upload experimental results to include in your weekly report</p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-xl flex flex-col items-center justify-center gap-2"
              style={{
                height: 120,
                border: `1.5px dashed ${isDragging ? 'var(--accent)' : 'rgba(232,165,152,0.3)'}`,
                background: isDragging ? 'rgba(232,165,152,0.04)' : 'transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Upload size={20} style={{ color: 'var(--accent)', opacity: 0.7 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Drop files here or click to upload</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5, letterSpacing: '0.06em' }}>PDF · JPG · PNG · DOCX</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.docx"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((file) => (
                  <div key={file.name} className="flex items-center gap-3 rounded-lg px-4 py-2.5" style={innerCard}>
                    {file.type.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.url} alt={file.name} className="h-10 w-10 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded flex-shrink-0" style={{ background: 'rgba(232,165,152,0.1)' }}>
                        <FileText size={16} style={{ color: 'var(--accent)' }} />
                      </div>
                    )}
                    <span className="flex-1 truncate text-sm" style={{ color: 'var(--text-secondary)' }}>{file.name}</span>
                    <button onClick={() => removeFile(file.name)} className="flex-shrink-0 transition-opacity hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live report (before save) */}
          {liveReport && !weeklyReports.some((r) => r.report_content === liveReport) && (
            <div className="rounded-xl p-6 space-y-3" style={{ ...cardStyle, borderLeft: '2px solid var(--accent)' }}>
              <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>New Report — This Week</p>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{liveReport}</pre>
            </div>
          )}

          {/* Past reports */}
          <div>
            <h2 className="mb-3 font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>Past Reports</h2>
            {weeklyReports.length === 0 && !liveReport ? (
              <div className="rounded-xl p-8 text-center" style={cardStyle}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No past reports yet. Generate your first one above.</p>
              </div>
            ) : (
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
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmtWeek(report.week_start, report.week_end)}</p>
                          {!isExpanded && report.report_content && (
                            <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--text-muted)' }}>{report.report_content.slice(0, 120)}…</p>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                      </button>
                      {isExpanded && report.report_content && (
                        <div className="px-5 pb-5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{report.report_content}</pre>
                          <button
                            onClick={() => { navigator.clipboard.writeText(report.report_content ?? ''); toast.success('Copied!') }}
                            className="mt-4 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-70"
                            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}
                          >
                            <ClipboardCopy size={11} /> Export (copy)
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: This Week at a Glance */}
        <div className="w-full lg:w-72 flex-shrink-0">
          <div className="rounded-xl p-5 space-y-5 sticky top-4" style={cardStyle}>
            <div className="flex items-center gap-2">
              <FlaskConical size={14} style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>This Week at a Glance</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={innerCard}>
                <p className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>{thisWeekProtocolIds.length}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Protocol{thisWeekProtocolIds.length !== 1 ? 's' : ''} worked on</p>
              </div>
              <div className="rounded-lg p-3" style={innerCard}>
                <p className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>{thisWeekSteps}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Steps completed</p>
              </div>
            </div>

            {workedProtocolIds.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity this week yet.</p>
            ) : (
              <div className="space-y-4">
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
        </div>
      </div>
    </div>
  )
}
