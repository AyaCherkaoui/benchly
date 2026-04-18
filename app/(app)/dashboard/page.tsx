import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { ArrowRight, FlaskConical, BookOpen, TestTube, Mic } from 'lucide-react'
import { Protocol } from '@/types'
import DashboardGreeting from '@/components/DashboardGreeting'
import DashboardSeedButton from '@/components/DashboardSeedButton'

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

  // Parallel fetch: profile, sessions, protocols, total samples count
  const [{ data: profile }, { data: sessions }, { data: protocols }, { count: samplesCount }] =
    await Promise.all([
      supabase.from('profiles').select('full_name, lab_name').eq('id', userId).single(),
      supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_updated', { ascending: false }),
      supabase.from('protocols').select('*').order('created_at'),
      supabase
        .from('samples')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ])

  // Feature 6: fall back to auth metadata if profile row has no name
  const rawName =
    profile?.full_name ??
    (session.user.user_metadata?.full_name as string | undefined) ??
    ''
  const firstName = rawName.split(' ')[0] || 'there'

  const activeSession = sessions?.[0] ?? null

  // Fetch active protocol name + step count + current step title
  let activeProtocolName = ''
  let totalStepsInProtocol = 0
  let currentStepTitle = ''
  if (activeSession) {
    const [{ data: proto }, { count }, { data: stepData }] = await Promise.all([
      supabase
        .from('protocols')
        .select('name')
        .eq('id', activeSession.protocol_id)
        .single(),
      supabase
        .from('steps')
        .select('*', { count: 'exact', head: true })
        .eq('protocol_id', activeSession.protocol_id),
      supabase
        .from('steps')
        .select('title')
        .eq('protocol_id', activeSession.protocol_id)
        .eq('step_number', activeSession.current_step)
        .single(),
    ])
    activeProtocolName = proto?.name ?? ''
    totalStepsInProtocol = count ?? 0
    currentStepTitle = stepData?.title ?? ''
  }

  // ── Build greeting ────────────────────────────────────────────────────────
  const hour = new Date().getUTCHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  let greeting = `Good ${timeOfDay}, ${firstName}. Welcome back to Benchly.`
  if (activeSession && activeProtocolName) {
    greeting += ` You're on step ${activeSession.current_step} of ${totalStepsInProtocol} in ${activeProtocolName}`
    if (currentStepTitle) greeting += ` — you left off at ${currentStepTitle}.`
    else greeting += '.'
  }
  if ((samplesCount ?? 0) > 0) {
    greeting += ` You have ${samplesCount} sample${samplesCount !== 1 ? 's' : ''} currently tracked.`
  }
  greeting += ` Tell me when you're ready and I'll guide you through your next steps.`

  // ── Stats ─────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const stepsToday =
    sessions
      ?.filter((s) => s.last_updated?.startsWith(today))
      .reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0
  const totalStepsDone =
    sessions?.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0

  const completedStepsCount = activeSession?.completed_steps?.length ?? 0
  const progressPct =
    totalStepsInProtocol > 0
      ? Math.round((completedStepsCount / totalStepsInProtocol) * 100)
      : 0

  const lastActivityDate = sessions?.[0]?.last_updated
    ? new Date(sessions[0].last_updated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  const hasSessions = (sessions?.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Invisible greeting player */}
      <DashboardGreeting text={greeting} />

      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {firstName} 👋
        </h1>
        <p className="mt-1 text-slate-400">Here&apos;s what&apos;s happening in your lab</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Protocols Started', value: sessions?.length ?? 0 },
          { label: 'Steps Done Today', value: stepsToday },
          { label: 'Total Steps Completed', value: totalStepsDone },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl bg-[#152235] p-5">
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="mt-1 text-sm text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Today's Briefing card */}
      <div className="rounded-2xl bg-[#152235] p-5 ring-1 ring-teal-500/20">
        <div className="mb-4 flex items-center gap-2">
          <Mic size={16} className="text-teal-400" />
          <h2 className="font-semibold text-white">Today&apos;s Briefing</h2>
        </div>
        <div className="space-y-2 text-sm">
          {activeSession && activeProtocolName ? (
            <div className="flex items-start gap-2">
              <FlaskConical size={14} className="mt-0.5 flex-shrink-0 text-teal-400" />
              <span className="text-slate-300">
                <span className="font-medium text-white">In progress:</span>{' '}
                {activeProtocolName} — Step {activeSession.current_step}
                {totalStepsInProtocol > 0 ? ` of ${totalStepsInProtocol}` : ''}
                {currentStepTitle ? ` · ${currentStepTitle}` : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <FlaskConical size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span className="text-slate-500">No active protocol — start one below</span>
            </div>
          )}

          <div className="flex items-start gap-2">
            <TestTube size={14} className="mt-0.5 flex-shrink-0 text-teal-400" />
            <span className="text-slate-300">
              <span className="font-medium text-white">{samplesCount ?? 0}</span> sample
              {samplesCount !== 1 ? 's' : ''} currently tracked
            </span>
          </div>

          <div className="flex items-start gap-2">
            <BookOpen size={14} className="mt-0.5 flex-shrink-0 text-teal-400" />
            <span className="text-slate-300">
              <span className="font-medium text-white">{stepsToday}</span> step
              {stepsToday !== 1 ? 's' : ''} completed today
              {lastActivityDate ? ` · Last activity: ${lastActivityDate}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Demo seed (shown only when user has no data) */}
      {!hasSessions && <DashboardSeedButton />}

      {/* Active session or start cards */}
      {activeSession ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Continue where you left off</h2>
          <div className="rounded-2xl bg-[#152235] p-6 ring-1 ring-teal-500/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Active Protocol</p>
                <h3 className="text-xl font-semibold text-white">{activeProtocolName}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Step {activeSession.current_step}
                  {totalStepsInProtocol > 0 && ` of ${totalStepsInProtocol}`}
                  {' · '}
                  {completedStepsCount} step{completedStepsCount !== 1 ? 's' : ''} completed
                </p>
              </div>
              <Link
                href={`/protocol/${activeSession.protocol_id}`}
                className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
              >
                Continue <ArrowRight size={16} />
              </Link>
            </div>

            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Progress</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-2 rounded-full bg-teal-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Start a Protocol</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {((protocols as Protocol[]) ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/protocol/${p.id}`}
                className="group flex items-center justify-between gap-4 rounded-2xl bg-[#152235] p-6 ring-1 ring-slate-700/50 transition hover:ring-teal-500/50"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-teal-500/10 p-2">
                    <FlaskConical size={20} className="text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    <p className="mt-0.5 text-sm text-slate-400">{p.description}</p>
                  </div>
                </div>
                <ArrowRight
                  size={18}
                  className="flex-shrink-0 text-slate-600 transition group-hover:text-teal-400"
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
