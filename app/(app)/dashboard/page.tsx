import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { FlaskConical, Mic, TestTube, BookOpen, ArrowRight, BarChart2 } from 'lucide-react'
import DashboardGreeting from '@/components/DashboardGreeting'
import DashboardSeedButton from '@/components/DashboardSeedButton'
import DashboardTasks from '@/components/DashboardTasks'
import DailySummaryTrigger from '@/components/DailySummaryTrigger'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default async function DashboardPage() {
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

  // ── Data fetching ─────────────────────────────────────────────────────────
  const [
    { data: profile },
    { data: allSessions },
    { data: allSamples },
    { count: voiceCount },
  ] = await Promise.all([
    supabase.from('profiles').select('full_name, lab_name').eq('id', userId).single(),
    supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_updated', { ascending: false }),
    supabase
      .from('samples')
      .select('id, tube_label, location, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('voice_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  // ── Name / greeting ───────────────────────────────────────────────────────
  const rawName =
    profile?.full_name ??
    (session.user.user_metadata?.full_name as string | undefined) ??
    ''
  const firstName = rawName.split(' ')[0] || 'there'

  const hour = new Date().getUTCHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  // ── Active session ────────────────────────────────────────────────────────
  const activeSession = allSessions?.[0] ?? null

  let activeProtocolName = ''
  let activeProtocolSteps: { id: string; step_number: number; title: string }[] = []
  let currentStepTitle = ''
  let totalStepsInProtocol = 0

  if (activeSession) {
    const [{ data: proto }, { data: stepsData }] = await Promise.all([
      supabase.from('protocols').select('name').eq('id', activeSession.protocol_id).single(),
      supabase
        .from('steps')
        .select('id, step_number, title')
        .eq('protocol_id', activeSession.protocol_id)
        .order('step_number'),
    ])
    activeProtocolName = proto?.name ?? ''
    activeProtocolSteps = stepsData ?? []
    totalStepsInProtocol = activeProtocolSteps.length
    currentStepTitle =
      activeProtocolSteps.find((s) => s.step_number === activeSession.current_step)?.title ?? ''
  }

  // ── Greeting text ─────────────────────────────────────────────────────────
  let greeting = `Good ${timeOfDay}, ${firstName}. Welcome back to Benchly.`
  if (activeSession && activeProtocolName) {
    greeting += ` You're on step ${activeSession.current_step} of ${totalStepsInProtocol} in ${activeProtocolName}`
    if (currentStepTitle) greeting += ` — you left off at ${currentStepTitle}.`
    else greeting += '.'
  }
  const samplesCount = allSamples?.length ?? 0
  if (samplesCount > 0) {
    greeting += ` You have ${samplesCount} sample${samplesCount !== 1 ? 's' : ''} currently tracked.`
  }
  greeting += ` Tell me when you're ready and I'll guide you through your next steps.`

  // ── Stats ─────────────────────────────────────────────────────────────────
  const today = new Date()
  const todayStr = isoDate(today)
  const yesterdayDate = new Date(today)
  yesterdayDate.setDate(today.getDate() - 1)
  const yesterdayStr = isoDate(yesterdayDate)

  const stepsToday =
    allSessions
      ?.filter((s) => s.last_updated?.startsWith(todayStr))
      .reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0

  const totalStepsDone =
    allSessions?.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0

  // ── Weekly calendar ───────────────────────────────────────────────────────
  const monday = getMondayOfWeek(today)
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      date: d,
      dateStr: isoDate(d),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
    }
  })

  const weekDayMap: Record<string, number> = {}
  for (const day of weekDays) {
    weekDayMap[day.dateStr] =
      allSessions
        ?.filter((s) => s.last_updated?.startsWith(day.dateStr))
        .reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0
  }

  // ── Weekly progress ───────────────────────────────────────────────────────
  const mondayISO = monday.toISOString()
  const weekStepsDone =
    allSessions
      ?.filter((s) => s.last_updated >= mondayISO)
      .reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0
  const weekStepsTotal = totalStepsInProtocol || 8 // fallback

  // ── Sample reminders (logged > 3 days ago) ────────────────────────────────
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const staleSamples =
    allSamples?.filter((s) => new Date(s.created_at) < threeDaysAgo).slice(0, 3) ?? []

  // ── Lab stats ─────────────────────────────────────────────────────────────
  const completedProtocols =
    allSessions?.filter((s) => {
      const len = s.completed_steps?.length ?? 0
      return len > 0 && len >= (s.current_step ?? 0)
    }).length ?? 0

  const hasSessions = (allSessions?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Invisible greeting player + daily summary trigger */}
      <DashboardGreeting text={greeting} />
      <DailySummaryTrigger yesterday={yesterdayStr} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Good {timeOfDay}, {firstName}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {!hasSessions && <DashboardSeedButton />}
      </div>

      {/* Briefing strip */}
      <div className="flex items-center gap-6 rounded-2xl bg-[#152235] px-6 py-4 ring-1 ring-teal-500/20">
        <Mic size={16} className="flex-shrink-0 text-teal-400" />
        <div className="flex flex-wrap gap-6 text-sm">
          {activeSession && activeProtocolName ? (
            <span className="text-slate-300">
              <span className="font-medium text-white">In progress:</span>{' '}
              {activeProtocolName} · Step {activeSession.current_step}/{totalStepsInProtocol}
              {currentStepTitle ? ` · ${currentStepTitle}` : ''}
            </span>
          ) : (
            <span className="text-slate-500">No active protocol</span>
          )}
          <span className="text-slate-400">{samplesCount} samples tracked</span>
          <span className="text-slate-400">{stepsToday} steps done today</span>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-12 gap-5">

        {/* ── Left column (5 cols) ──────────────────────────────────── */}
        <div className="col-span-5 space-y-5">
          {/* Today's Tasks */}
          {activeSession && activeProtocolSteps.length > 0 ? (
            <DashboardTasks
              sessionId={activeSession.id}
              protocolId={activeSession.protocol_id}
              protocolName={activeProtocolName}
              steps={activeProtocolSteps}
              completedStepNumbers={activeSession.completed_steps ?? []}
            />
          ) : (
            <div className="rounded-2xl bg-[#152235] p-5">
              <h3 className="font-semibold text-white mb-3">Today&apos;s Tasks</h3>
              <p className="text-sm text-slate-500">No active protocol. Start one to see your tasks here.</p>
              <Link
                href="/protocol"
                className="mt-3 flex items-center gap-1.5 text-sm text-teal-400 hover:underline"
              >
                Browse protocols <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* Sample Reminders */}
          <div className="rounded-2xl bg-[#152235] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-white">Sample Reminders</h3>
              <Link href="/samples" className="text-xs text-teal-400 hover:underline">View all</Link>
            </div>
            {staleSamples.length === 0 ? (
              <p className="text-sm text-slate-500">No samples need attention.</p>
            ) : (
              <ul className="space-y-2">
                {staleSamples.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TestTube size={13} className="text-slate-400" />
                      <span className="text-sm text-slate-200">{s.tube_label}</span>
                      <span className="text-xs text-slate-500">{s.location}</span>
                    </div>
                    <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                      Check on this
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Center column (4 cols) ────────────────────────────────── */}
        <div className="col-span-4 space-y-5">
          {/* This Week mini calendar */}
          <div className="rounded-2xl bg-[#152235] p-5">
            <h3 className="mb-4 font-semibold text-white">This Week</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {weekDays.map((day) => {
                const isToday = day.dateStr === todayStr
                const count = weekDayMap[day.dateStr] ?? 0
                const hasActivity = count > 0
                return (
                  <Link
                    key={day.dateStr}
                    href={`/log`}
                    className={`flex flex-col items-center rounded-xl py-3 transition ${
                      isToday
                        ? 'bg-teal-500/20 ring-1 ring-teal-500/50'
                        : hasActivity
                        ? 'bg-slate-800/60 hover:bg-slate-700/60'
                        : 'bg-slate-800/30 hover:bg-slate-800/50'
                    }`}
                  >
                    <span className={`text-[10px] font-medium ${isToday ? 'text-teal-400' : 'text-slate-500'}`}>
                      {day.label}
                    </span>
                    <span className={`mt-1 text-sm font-bold ${isToday ? 'text-white' : 'text-slate-300'}`}>
                      {day.dayNum}
                    </span>
                    <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                      isToday ? 'bg-teal-400' : hasActivity ? 'bg-green-400' : 'bg-slate-700'
                    }`} />
                    {count > 0 && (
                      <span className="mt-1 text-[9px] text-slate-500">{count}s</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Weekly Progress */}
          <div className="rounded-2xl bg-[#152235] p-5">
            <div className="mb-3 flex items-center gap-2">
              <BarChart2 size={15} className="text-teal-400" />
              <h3 className="font-semibold text-white">Weekly Progress</h3>
            </div>
            <div className="mb-2 flex justify-between text-xs text-slate-400">
              <span>{weekStepsDone} steps done this week</span>
              <span>{Math.min(100, Math.round((weekStepsDone / weekStepsTotal) * 100))}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div
                className="h-2 rounded-full bg-teal-500 transition-all"
                style={{ width: `${Math.min(100, Math.round((weekStepsDone / weekStepsTotal) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Goal: complete {weekStepsTotal} steps in {activeProtocolName || 'your protocol'}
            </p>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Steps today', value: stepsToday, icon: BookOpen },
              { label: 'Samples tracked', value: samplesCount, icon: TestTube },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl bg-[#152235] p-4">
                <Icon size={14} className="mb-1.5 text-teal-400" />
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column (3 cols) ─────────────────────────────────── */}
        <div className="col-span-3 space-y-5">
          {/* Quick Actions */}
          <div className="rounded-2xl bg-[#152235] p-5">
            <h3 className="mb-4 font-semibold text-white">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/meeting"
                className="flex w-full items-center gap-3 rounded-xl bg-slate-800/50 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-700/60 hover:text-white"
              >
                <FlaskConical size={14} className="text-teal-400" />
                Generate Weekly Report
              </Link>
              <Link
                href="/samples"
                className="flex w-full items-center gap-3 rounded-xl bg-slate-800/50 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-700/60 hover:text-white"
              >
                <TestTube size={14} className="text-teal-400" />
                Add Sample
              </Link>
              <Link
                href="/protocol"
                className="flex w-full items-center gap-3 rounded-xl bg-slate-800/50 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-700/60 hover:text-white"
              >
                <BookOpen size={14} className="text-teal-400" />
                Start New Protocol
              </Link>
            </div>
          </div>

          {/* Lab Stats */}
          <div className="rounded-2xl bg-[#152235] p-5">
            <h3 className="mb-4 font-semibold text-white">Lab Stats</h3>
            <ul className="space-y-3">
              {[
                { label: 'Protocols completed', value: completedProtocols },
                { label: 'Total samples tracked', value: samplesCount },
                { label: 'Voice interactions', value: voiceCount ?? 0 },
                { label: 'Total steps done', value: totalStepsDone },
              ].map(({ label, value }) => (
                <li key={label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{label}</span>
                  <span className="text-sm font-bold text-white">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  )
}
