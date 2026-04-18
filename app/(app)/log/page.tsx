'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, FlaskConical, TestTube, Mic } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  protocol_id: string
  current_step: number
  completed_steps: number[]
  last_updated: string
  protocols: { name: string } | null
}

interface SampleRow {
  id: string
  tube_label: string
  location: string
  created_at: string
}

interface VoiceLogRow {
  id: string
  transcript: string
  action_taken: string | null
  type: string
  created_at: string
  response: string | null
}

interface DaySummary {
  id?: string
  date: string
  summary: string | null
}

interface DayData {
  dateStr: string
  dayLabel: string
  dayNum: number
  sessions: SessionRow[]
  samples: SampleRow[]
  voiceLogs: VoiceLogRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${friday.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const supabase = createSupabaseBrowserClient()

  // Week offset: 0 = current week, -1 = previous, etc.
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [days, setDays] = useState<DayData[]>([])
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loading, setLoading] = useState(true)

  // Compute week dates
  const today = new Date()
  const baseMondayRef = getMondayOfWeek(today)

  const monday = new Date(baseMondayRef)
  monday.setDate(baseMondayRef.getDate() + weekOffset * 7)

  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      dateStr: isoDate(d),
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
    }
  })

  const todayStr = isoDate(today)
  const weekStart = isoDate(monday)
  const weekEndDate = new Date(monday)
  weekEndDate.setDate(monday.getDate() + 4)
  weekEndDate.setHours(23, 59, 59, 999)
  const weekEnd = weekEndDate.toISOString()

  useEffect(() => {
    if (!selectedDay) setSelectedDay(todayStr)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch week data ────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchWeek() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: sessionsRaw }, { data: samplesRaw }, { data: voiceLogsRaw }] =
        await Promise.all([
          supabase
            .from('sessions')
            .select('id, protocol_id, current_step, completed_steps, last_updated, protocols(name)')
            .eq('user_id', user.id)
            .gte('last_updated', `${weekStart}T00:00:00Z`)
            .lte('last_updated', weekEnd)
            .order('last_updated', { ascending: false }),
          supabase
            .from('samples')
            .select('id, tube_label, location, created_at')
            .eq('user_id', user.id)
            .gte('created_at', `${weekStart}T00:00:00Z`)
            .lte('created_at', weekEnd)
            .order('created_at', { ascending: false }),
          supabase
            .from('voice_logs')
            .select('id, transcript, action_taken, type, created_at, response')
            .eq('user_id', user.id)
            .gte('created_at', `${weekStart}T00:00:00Z`)
            .lte('created_at', weekEnd)
            .order('created_at', { ascending: false }),
        ])

      const sessions = (sessionsRaw ?? []) as unknown as SessionRow[]
      const samples = (samplesRaw ?? []) as SampleRow[]
      const voiceLogs = (voiceLogsRaw ?? []) as VoiceLogRow[]

      const built: DayData[] = weekDays.map((d) => ({
        ...d,
        sessions: sessions.filter((s) => s.last_updated.startsWith(d.dateStr)),
        samples: samples.filter((s) => s.created_at.startsWith(d.dateStr)),
        voiceLogs: voiceLogs.filter((l) => l.created_at.startsWith(d.dateStr)),
      }))

      setDays(built)
      setLoading(false)
    }

    fetchWeek()
  }, [weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch daily summary ────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedDay) return

    async function fetchSummary() {
      setLoadingSummary(true)
      setSummary(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      try {
        const { data } = await supabase
          .from('daily_summaries')
          .select('id, date, summary')
          .eq('user_id', user.id)
          .eq('date', selectedDay!)
          .maybeSingle()
        setSummary(data as DaySummary | null)
      } catch {
        setSummary(null)
      } finally {
        setLoadingSummary(false)
      }
    }

    fetchSummary()
  }, [selectedDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDayData = days.find((d) => d.dateStr === selectedDay)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Lab Journal</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your week at a glance — click any day for details
        </p>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-2xl bg-[#152235] px-5 py-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-700/50 hover:text-white"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-sm font-medium text-white">{formatWeekLabel(monday)}</span>
        <button
          onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-700/50 hover:text-white disabled:opacity-30"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      {/* Week grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-slate-500">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {days.map((day) => {
            const isToday = day.dateStr === todayStr
            const isSelected = day.dateStr === selectedDay
            const isEmpty =
              day.sessions.length === 0 &&
              day.samples.length === 0 &&
              day.voiceLogs.length === 0
            const stepsDone = day.sessions.reduce(
              (acc, s) => acc + (s.completed_steps?.length ?? 0),
              0
            )
            const protocolNames = Array.from(
              new Set(
                day.sessions
                  .map((s) => (s.protocols as unknown as { name: string } | null)?.name)
                  .filter(Boolean)
              )
            )

            return (
              <div
                key={day.dateStr}
                onClick={() => setSelectedDay(day.dateStr)}
                className={`cursor-pointer rounded-2xl p-4 transition ${
                  isSelected
                    ? 'bg-teal-500/15 ring-1 ring-teal-500/50'
                    : isEmpty
                    ? 'bg-slate-800/30 hover:bg-slate-800/50'
                    : 'bg-[#152235] hover:ring-1 hover:ring-slate-600'
                }`}
              >
                {/* Day header */}
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-medium ${isToday ? 'text-teal-400' : 'text-slate-400'}`}>
                      {day.dayLabel}
                    </p>
                    <p className={`text-lg font-bold ${isToday ? 'text-teal-300' : 'text-white'}`}>
                      {day.dayNum}
                    </p>
                  </div>
                  {isToday && (
                    <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-medium text-teal-400">
                      Today
                    </span>
                  )}
                </div>

                {isEmpty ? (
                  <p className="text-xs text-slate-600">No activity</p>
                ) : (
                  <div className="space-y-2">
                    {stepsDone > 0 && (
                      <div className="flex items-center gap-1.5">
                        <FlaskConical size={11} className="text-teal-400" />
                        <span className="text-xs text-slate-300">{stepsDone} step{stepsDone !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {day.samples.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <TestTube size={11} className="text-teal-400" />
                        <span className="text-xs text-slate-300">{day.samples.length} sample{day.samples.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {day.voiceLogs.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Mic size={11} className="text-teal-400" />
                        <span className="text-xs text-slate-300">{day.voiceLogs.length} voice</span>
                      </div>
                    )}
                    {protocolNames.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {protocolNames.map((name) => (
                          <span
                            key={name as string}
                            className="rounded-full bg-teal-500/10 px-1.5 py-0.5 text-[9px] text-teal-400"
                          >
                            {name as string}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Daily Summary / Detail */}
      {selectedDayData && (
        <div className="rounded-2xl bg-[#152235] p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">
            {selectedDay === todayStr
              ? 'Today'
              : new Date(selectedDay! + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
            <span className="ml-2 text-sm font-normal text-slate-400">{selectedDay}</span>
          </h2>

          {/* AI Summary */}
          {loadingSummary ? (
            <p className="mb-4 text-sm text-slate-500">Loading summary…</p>
          ) : summary?.summary ? (
            <div className="mb-5 rounded-xl bg-teal-500/5 p-4 ring-1 ring-teal-500/20">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-400">Daily Summary</p>
              <p className="text-sm text-slate-200">{summary.summary}</p>
            </div>
          ) : null}

          {selectedDayData.sessions.length === 0 &&
          selectedDayData.samples.length === 0 &&
          selectedDayData.voiceLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded for this day.</p>
          ) : (
            <div className="space-y-5">
              {/* Protocol work */}
              {selectedDayData.sessions.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <FlaskConical size={13} className="text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Protocol Work
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedDayData.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-2.5"
                      >
                        <span className="text-sm font-medium text-white">
                          {(s.protocols as unknown as { name: string } | null)?.name ?? 'Unknown protocol'}
                        </span>
                        <span className="text-xs text-slate-400">
                          {s.completed_steps?.length ?? 0} steps done · at step {s.current_step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Samples */}
              {selectedDayData.samples.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <TestTube size={13} className="text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Samples Logged
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedDayData.samples.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-2.5"
                      >
                        <span className="text-sm font-medium text-white">{s.tube_label}</span>
                        <span className="text-xs text-slate-400">{s.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Voice logs */}
              {selectedDayData.voiceLogs.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Mic size={13} className="text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Voice Interactions
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedDayData.voiceLogs.map((l) => (
                      <div
                        key={l.id}
                        className="rounded-xl bg-slate-800/50 px-4 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-200">"{l.transcript}"</span>
                          {l.action_taken && l.action_taken !== 'unknown' && (
                            <span className="flex-shrink-0 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-400">
                              {l.action_taken.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        {l.response && (
                          <p className="mt-1 text-xs text-slate-500 italic">"{l.response}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
