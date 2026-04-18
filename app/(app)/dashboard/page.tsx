import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import DashboardGreeting from '@/components/DashboardGreeting'
import DashboardSeedButton from '@/components/DashboardSeedButton'
import DashboardTasks from '@/components/DashboardTasks'
import DailySummaryTrigger from '@/components/DailySummaryTrigger'

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}
function isoDate(d: Date) { return d.toISOString().split('T')[0] }
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const SAMPLE_COLORS = ['#e8a598', '#a8c5da', '#b8d4b8', '#d4c5a8', '#c5a8d4']

export default async function DashboardPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const userId = session.user.id

  const [{ data: profile }, { data: allSessions }, { data: recentSamples }] =
    await Promise.all([
      supabase.from('profiles').select('full_name, lab_name').eq('id', userId).single(),
      supabase.from('sessions').select('*').eq('user_id', userId).order('last_updated', { ascending: false }),
      supabase.from('samples').select('id, tube_label, location, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    ])

  const rawName = profile?.full_name ?? (session.user.user_metadata?.full_name as string | undefined) ?? ''
  const firstName = rawName.split(' ')[0] || 'there'
  const hour = new Date().getUTCHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const activeSession = allSessions?.[0] ?? null
  let activeProtocolName = ''
  let activeProtocolSteps: { id: string; step_number: number; title: string }[] = []
  let currentStepTitle = ''
  let totalStepsInProtocol = 0

  if (activeSession) {
    const [{ data: proto }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('name').eq('id', activeSession.protocol_id).single(),
      supabase.from('steps').select('id, step_number, title').eq('protocol_id', activeSession.protocol_id).order('step_number'),
    ])
    activeProtocolName = proto?.name ?? ''
    activeProtocolSteps = stepsData ?? []
    totalStepsInProtocol = activeProtocolSteps.length
    currentStepTitle = activeProtocolSteps.find((s) => s.step_number === activeSession.current_step)?.title ?? ''
  }

  let greeting = `Good ${timeOfDay}, ${firstName}. Welcome back to Benchly.`
  if (activeSession && activeProtocolName) {
    greeting += ` You're on step ${activeSession.current_step} of ${totalStepsInProtocol} in ${activeProtocolName}`
    if (currentStepTitle) greeting += ` — you left off at ${currentStepTitle}.`
    else greeting += '.'
  }
  const samplesCount = recentSamples?.length ?? 0
  greeting += ` Tell me when you're ready and I'll guide you through your next steps.`

  const today = new Date()
  const todayStr = isoDate(today)
  const yesterdayDate = new Date(today); yesterdayDate.setDate(today.getDate() - 1)
  const yesterdayStr = isoDate(yesterdayDate)

  const completedStepsDone = activeSession?.completed_steps?.length ?? 0
  const totalDone = allSessions?.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0

  // Weekly calendar
  const monday = getMondayOfWeek(today)
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    return { date: d, dateStr: isoDate(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), dayNum: d.getDate() }
  })
  const weekDayMap: Record<string, number> = {}
  for (const day of weekDays) {
    weekDayMap[day.dateStr] = allSessions?.filter((s) => s.last_updated?.startsWith(day.dateStr)).reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0
  }

  const hasSessions = (allSessions?.length ?? 0) > 0
  const progressPct = totalStepsInProtocol > 0 ? Math.round((completedStepsDone / totalStepsInProtocol) * 100) : 0
  const lastActivity = allSessions?.[0]?.last_updated ? timeAgo(allSessions[0].last_updated) : null

  // Today's tasks done / total for the "X of X done" label
  return (
    <div className="space-y-6">
      <DashboardGreeting text={greeting} />
      <DailySummaryTrigger yesterday={yesterdayStr} />

      {/* ── Top 3-card row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Card 1: Samples */}
        <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Inventory · {samplesCount} active
            </span>
          </div>
          <h2 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>
            Samples
          </h2>
          <div className="space-y-2.5">
            {(recentSamples ?? []).slice(0, 4).map((s, i) => (
              <div key={s.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: SAMPLE_COLORS[i % SAMPLE_COLORS.length] }} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{s.tube_label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.location}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(s.created_at)}</span>
              </div>
            ))}
            {samplesCount === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No samples yet.</p>
            )}
          </div>
          <Link href="/samples" className="text-xs transition-opacity hover:opacity-70" style={{ color: 'var(--accent)', letterSpacing: '0.05em' }}>
            View all →
          </Link>
        </div>

        {/* Card 2: Resume */}
        <div className="rounded-xl p-6 space-y-4 flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {lastActivity ? `Last activity · ${lastActivity}` : 'No activity yet'}
            </span>
          </div>

          {activeSession && activeProtocolName ? (
            <>
              <h2 className="font-serif text-3xl italic font-normal leading-tight" style={{ color: 'var(--text-primary)' }}>
                {activeProtocolName}
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Step {activeSession.current_step} / {totalStepsInProtocol}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-px w-full" style={{ background: 'var(--border)' }}>
                  <div className="h-px" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
                </div>
                {currentStepTitle && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{currentStepTitle}</p>
                )}
              </div>
              <div className="flex-1" />
              <Link
                href={`/protocol/${activeSession.protocol_id}`}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#0a0a0a', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Resume Session →
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-serif text-3xl font-normal" style={{ color: 'var(--text-primary)' }}>
                No active session
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Start a protocol to begin tracking your work.
              </p>
              <div className="flex-1" />
              <Link
                href="/protocol"
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 transition-opacity hover:opacity-80"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Browse Protocols →
              </Link>
              {!hasSessions && (
                <div className="mt-2">
                  <DashboardSeedButton />
                </div>
              )}
            </>
          )}
        </div>

        {/* Card 3: Today */}
        <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {completedStepsDone} of {totalStepsInProtocol || '—'} done
            </span>
            <button className="text-xs transition-opacity hover:opacity-70" style={{ color: 'var(--accent)', letterSpacing: '0.06em' }}>
              + Summary
            </button>
          </div>
          <h2 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>
            Today
          </h2>

          {activeSession && activeProtocolSteps.length > 0 ? (
            <DashboardTasks
              sessionId={activeSession.id}
              protocolId={activeSession.protocol_id}
              protocolName={activeProtocolName}
              steps={activeProtocolSteps}
              completedStepNumbers={activeSession.completed_steps ?? []}
            />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active protocol tasks.</p>
          )}
        </div>
      </div>

      {/* ── This Week ────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>
              This week
            </h2>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>
              {monday.toLocaleDateString('en-US', { month: 'long' })} · 5 days · {totalDone} steps
            </p>
          </div>
          <Link
            href="/meeting"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-opacity hover:opacity-80"
            style={{ border: '1px solid var(--border)', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}
          >
            + Report
          </Link>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {weekDays.map((day) => {
            const isToday = day.dateStr === todayStr
            const count = weekDayMap[day.dateStr] ?? 0
            return (
              <Link
                key={day.dateStr}
                href="/log"
                className="rounded-lg p-4 transition-colors"
                style={{
                  background: isToday ? 'rgba(232,165,152,0.08)' : '#0f0f0f',
                  border: isToday ? '1px solid rgba(232,165,152,0.25)' : '1px solid var(--border)',
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {day.label}
                  </span>
                  {isToday && (
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                  )}
                </div>
                <p className="text-lg font-light" style={{ color: isToday ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {day.dayNum}
                </p>
                {count > 0 ? (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {count} step{count !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</p>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
