import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { BookOpen, FlaskConical, Mic, TestTube } from 'lucide-react'

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
}

interface DayData {
  dateStr: string
  label: string
  sessions: SessionRow[]
  samples: SampleRow[]
  voiceLogs: VoiceLogRow[]
}

function formatDayLabel(i: number, date: Date): string {
  if (i === 0) return 'Today'
  if (i === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default async function LogPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  // Build a date string for 6 days ago (start of that day UTC)
  const since = new Date()
  since.setDate(since.getDate() - 6)
  since.setHours(0, 0, 0, 0)
  const sinceISO = since.toISOString()

  // Parallel fetch for the last 7 days
  const [{ data: sessionsRaw }, { data: samplesRaw }, { data: voiceLogsRaw }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('id, protocol_id, current_step, completed_steps, last_updated, protocols(name)')
        .eq('user_id', userId)
        .gte('last_updated', sinceISO)
        .order('last_updated', { ascending: false }),
      supabase
        .from('samples')
        .select('id, tube_label, location, created_at')
        .eq('user_id', userId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false }),
      supabase
        .from('voice_logs')
        .select('id, transcript, action_taken, type, created_at')
        .eq('user_id', userId)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false }),
    ])

  const sessions = (sessionsRaw ?? []) as unknown as SessionRow[]
  const samples = (samplesRaw ?? []) as SampleRow[]
  const voiceLogs = (voiceLogsRaw ?? []) as VoiceLogRow[]

  // Group into 7-day buckets
  const days: DayData[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      dateStr,
      label: formatDayLabel(i, d),
      sessions: sessions.filter((s) => s.last_updated.startsWith(dateStr)),
      samples: samples.filter((s) => s.created_at.startsWith(dateStr)),
      voiceLogs: voiceLogs.filter((l) => l.created_at.startsWith(dateStr)),
    })
  }

  const today = days[0]
  const pastDays = days.slice(1)
  const totalStepsToday = today.sessions.reduce(
    (acc, s) => acc + (s.completed_steps?.length ?? 0),
    0
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Lab Journal</h1>
        <p className="mt-1 text-slate-400">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* TODAY card */}
      <div className="rounded-2xl bg-[#152235] p-6 ring-1 ring-teal-500/30">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Today</h2>
          <div className="flex gap-3 text-xs text-slate-400">
            <span>{totalStepsToday} step{totalStepsToday !== 1 ? 's' : ''} completed</span>
            <span>·</span>
            <span>{today.samples.length} sample{today.samples.length !== 1 ? 's' : ''} logged</span>
            <span>·</span>
            <span>{today.voiceLogs.length} voice interaction{today.voiceLogs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {today.sessions.length === 0 && today.samples.length === 0 && today.voiceLogs.length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet today.</p>
        ) : (
          <div className="space-y-5">
            {/* Protocol work */}
            {today.sessions.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <FlaskConical size={14} className="text-teal-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Protocol Work
                  </span>
                </div>
                <div className="space-y-2">
                  {today.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-white">
                        {s.protocols?.name ?? 'Unknown protocol'}
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
            {today.samples.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <TestTube size={14} className="text-teal-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Samples Logged
                  </span>
                </div>
                <div className="space-y-2">
                  {today.samples.map((s) => (
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

            {/* Voice interactions */}
            {today.voiceLogs.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Mic size={14} className="text-teal-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Voice Interactions
                  </span>
                </div>
                <div className="space-y-2">
                  {today.voiceLogs.map((l) => (
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
                      {l.type === 'question' && (
                        <p className="mt-0.5 text-[11px] text-slate-500">Observation / question</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Past 6 days */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Past 6 Days</h2>
        <div className="space-y-3">
          {pastDays.map((day) => {
            const stepsDone = day.sessions.reduce(
              (acc, s) => acc + (s.completed_steps?.length ?? 0),
              0
            )
            const protocolNames = Array.from(
              new Set(day.sessions.map((s) => s.protocols?.name).filter(Boolean))
            )
            const isEmpty =
              day.sessions.length === 0 &&
              day.samples.length === 0 &&
              day.voiceLogs.length === 0

            return (
              <div
                key={day.dateStr}
                className={`rounded-2xl p-5 ${
                  isEmpty ? 'bg-slate-800/30' : 'bg-[#152235]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{day.label}</p>
                    <p className="text-xs text-slate-500">{day.dateStr}</p>
                  </div>
                  {!isEmpty && (
                    <div className="flex gap-3 text-xs text-slate-400">
                      {stepsDone > 0 && (
                        <span className="flex items-center gap-1">
                          <BookOpen size={11} />
                          {stepsDone} step{stepsDone !== 1 ? 's' : ''}
                        </span>
                      )}
                      {day.samples.length > 0 && (
                        <span className="flex items-center gap-1">
                          <TestTube size={11} />
                          {day.samples.length} sample{day.samples.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {day.voiceLogs.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Mic size={11} />
                          {day.voiceLogs.length} voice
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isEmpty ? (
                  <p className="mt-2 text-xs text-slate-600">No activity recorded</p>
                ) : (
                  protocolNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {protocolNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs text-teal-400"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
