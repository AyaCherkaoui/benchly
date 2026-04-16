import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { Protocol } from '@/types'

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

  // Fetch in parallel: profile, sessions, protocols
  const [{ data: profile }, { data: sessions }, { data: protocols }] =
    await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).single(),
      supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .order('last_updated', { ascending: false }),
      supabase.from('protocols').select('*').order('created_at'),
    ])

  const activeSession = sessions?.[0] ?? null

  // If there's an active session, get that protocol's name + total step count
  let activeProtocolName = ''
  let totalStepsInProtocol = 0
  if (activeSession) {
    const [{ data: proto }, { count }] = await Promise.all([
      supabase
        .from('protocols')
        .select('name')
        .eq('id', activeSession.protocol_id)
        .single(),
      supabase
        .from('steps')
        .select('*', { count: 'exact', head: true })
        .eq('protocol_id', activeSession.protocol_id),
    ])
    activeProtocolName = proto?.name ?? ''
    totalStepsInProtocol = count ?? 0
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
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

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {firstName} 👋
        </h1>
        <p className="mt-1 text-slate-400">
          Here&apos;s what&apos;s happening in your lab
        </p>
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

      {/* Active session or start cards */}
      {activeSession ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Continue where you left off
          </h2>
          <div className="rounded-2xl bg-[#152235] p-6 ring-1 ring-teal-500/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Active Protocol</p>
                <h3 className="text-xl font-semibold text-white">
                  {activeProtocolName}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Step {activeSession.current_step}
                  {totalStepsInProtocol > 0 && ` of ${totalStepsInProtocol}`}
                  {' · '}
                  {completedStepsCount} step
                  {completedStepsCount !== 1 ? 's' : ''} completed
                </p>
              </div>
              <Link
                href={`/protocol/${activeSession.protocol_id}`}
                className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
              >
                Continue <ArrowRight size={16} />
              </Link>
            </div>

            {/* Progress bar */}
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
          <h2 className="mb-4 text-lg font-semibold text-white">
            Start a Protocol
          </h2>
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
                    <p className="mt-0.5 text-sm text-slate-400">
                      {p.description}
                    </p>
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
