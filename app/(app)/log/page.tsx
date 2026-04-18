'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FlaskConical, TestTube, Mic } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

interface SessionRow {
  id: string; protocol_id: string; current_step: number
  completed_steps: number[]; last_updated: string
  protocols: { name: string } | null
}
interface SampleRow { id: string; tube_label: string; location: string; created_at: string }
interface VoiceLogRow { id: string; transcript: string; action_taken: string | null; type: string; created_at: string; response: string | null }
interface DailySummaryRow { id?: string; date: string; summary: string | null }
interface DayData { dateStr: string; dayLabel: string; dayNum: number; sessions: SessionRow[]; samples: SampleRow[]; voiceLogs: VoiceLogRow[] }

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0, 0, 0, 0); return m
}
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4)
  return `${monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${friday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
}

export default function LogPage() {
  const supabase = createSupabaseBrowserClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [days, setDays] = useState<DayData[]>([])
  const [summary, setSummary] = useState<DailySummaryRow | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const baseMondayRef = getMondayOfWeek(today)
  const monday = new Date(baseMondayRef)
  monday.setDate(baseMondayRef.getDate() + weekOffset * 7)

  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    return { dateStr: isoDate(d), dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }), dayNum: d.getDate() }
  })

  const todayStr = isoDate(today)
  const weekStart = isoDate(monday)
  const weekEndDate = new Date(monday); weekEndDate.setDate(monday.getDate() + 4); weekEndDate.setHours(23, 59, 59, 999)
  const weekEnd = weekEndDate.toISOString()

  useEffect(() => { if (!selectedDay) setSelectedDay(todayStr) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchWeek() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: sessionsRaw }, { data: samplesRaw }, { data: voiceLogsRaw }] = await Promise.all([
        supabase.from('sessions').select('id, protocol_id, current_step, completed_steps, last_updated, protocols(name)').eq('user_id', user.id).gte('last_updated', `${weekStart}T00:00:00Z`).lte('last_updated', weekEnd).order('last_updated', { ascending: false }),
        supabase.from('samples').select('id, tube_label, location, created_at').eq('user_id', user.id).gte('created_at', `${weekStart}T00:00:00Z`).lte('created_at', weekEnd).order('created_at', { ascending: false }),
        supabase.from('voice_logs').select('id, transcript, action_taken, type, created_at, response').eq('user_id', user.id).gte('created_at', `${weekStart}T00:00:00Z`).lte('created_at', weekEnd).order('created_at', { ascending: false }),
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
      setDays(built); setLoading(false)
    }
    fetchWeek()
  }, [weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDay) return
    async function fetchSummary() {
      setLoadingSummary(true); setSummary(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      try {
        const { data } = await supabase.from('daily_summaries').select('id, date, summary').eq('user_id', user.id).eq('date', selectedDay!).maybeSingle()
        setSummary(data as DailySummaryRow | null)
      } catch { setSummary(null) } finally { setLoadingSummary(false) }
    }
    fetchSummary()
  }, [selectedDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDayData = days.find((d) => d.dateStr === selectedDay)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>Lab Journal</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>Click any day for full detail</p>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between rounded-xl px-5 py-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <button onClick={() => setWeekOffset((w) => w - 1)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-70" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatWeekLabel(monday)}</span>
        <button onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset >= 0}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-20"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          Next <ChevronRight size={14} />
        </button>
      </div>

      {/* Week grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {days.map((day) => {
            const isToday = day.dateStr === todayStr
            const isSelected = day.dateStr === selectedDay
            const isEmpty = day.sessions.length === 0 && day.samples.length === 0 && day.voiceLogs.length === 0
            const stepsDone = day.sessions.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0)
            const protocolNames = Array.from(new Set(day.sessions.map((s) => (s.protocols as unknown as { name: string } | null)?.name).filter(Boolean)))

            return (
              <div
                key={day.dateStr}
                onClick={() => setSelectedDay(day.dateStr)}
                className="cursor-pointer rounded-xl p-4 transition-colors"
                style={{
                  background: isSelected ? 'rgba(232,165,152,0.06)' : isEmpty ? '#0a0a0a' : 'var(--bg-card)',
                  border: isSelected ? '1px solid rgba(232,165,152,0.3)' : '1px solid var(--border)',
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {day.dayLabel}
                  </p>
                  {isToday && <div className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
                </div>
                <p className="text-xl font-light" style={{ color: isToday ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {day.dayNum}
                </p>

                {isEmpty ? (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</p>
                ) : (
                  <div className="mt-3 space-y-1">
                    {stepsDone > 0 && (
                      <div className="flex items-center gap-1.5">
                        <FlaskConical size={9} style={{ color: 'var(--accent)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stepsDone} step{stepsDone !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {day.samples.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <TestTube size={9} style={{ color: 'var(--accent)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{day.samples.length} sample{day.samples.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {day.voiceLogs.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Mic size={9} style={{ color: 'var(--accent)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{day.voiceLogs.length} voice</span>
                      </div>
                    )}
                    {protocolNames.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {protocolNames.map((name) => (
                          <span key={name as string} className="rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'rgba(232,165,152,0.1)', color: 'var(--accent)' }}>
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

      {/* Detail panel */}
      {selectedDayData && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="mb-5 flex items-baseline gap-3">
            <h2 className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>
              {selectedDay === todayStr ? 'Today' : new Date(selectedDay! + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{selectedDay}</span>
          </div>

          {loadingSummary ? (
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading summary…</p>
          ) : summary?.summary ? (
            <div className="mb-5 rounded-lg p-4" style={{ background: 'rgba(232,165,152,0.05)', borderLeft: '2px solid rgba(232,165,152,0.3)' }}>
              <p className="mb-1" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Daily Summary</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{summary.summary}</p>
            </div>
          ) : null}

          {selectedDayData.sessions.length === 0 && selectedDayData.samples.length === 0 && selectedDayData.voiceLogs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity recorded for this day.</p>
          ) : (
            <div className="space-y-5">
              {selectedDayData.sessions.length > 0 && (
                <div>
                  <p className="mb-3" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Protocol Work</p>
                  <div className="space-y-2">
                    {selectedDayData.sessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg px-4 py-2.5" style={{ background: '#0f0f0f', border: '1px solid var(--border)' }}>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{(s.protocols as unknown as { name: string } | null)?.name ?? 'Unknown protocol'}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.completed_steps?.length ?? 0} steps · step {s.current_step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDayData.samples.length > 0 && (
                <div>
                  <p className="mb-3" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Samples Logged</p>
                  <div className="space-y-2">
                    {selectedDayData.samples.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg px-4 py-2.5" style={{ background: '#0f0f0f', border: '1px solid var(--border)' }}>
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>{s.tube_label}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDayData.voiceLogs.length > 0 && (
                <div>
                  <p className="mb-3" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Voice Interactions</p>
                  <div className="space-y-2">
                    {selectedDayData.voiceLogs.map((l) => (
                      <div key={l.id} className="rounded-lg px-4 py-2.5" style={{ background: '#0f0f0f', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>"{l.transcript}"</span>
                          {l.action_taken && l.action_taken !== 'unknown' && (
                            <span className="flex-shrink-0 rounded px-2 py-0.5 text-[9px]" style={{ background: 'rgba(232,165,152,0.1)', color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {l.action_taken.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        {l.response && <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>"{l.response}"</p>}
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
