import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { anthropic } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date } = body as { date: string }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 })
  }

  // Check if summary already exists for this date
  const { data: existing } = await supabase
    .from('daily_summaries')
    .select('id, summary')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  if (existing?.summary) {
    return NextResponse.json({ summary: existing.summary, cached: true })
  }

  // Fetch all data for that day
  const dayStart = `${date}T00:00:00Z`
  const dayEnd = `${date}T23:59:59Z`

  const [{ data: voiceLogs }, { data: sessions }, { data: samples }] = await Promise.all([
    supabase
      .from('voice_logs')
      .select('transcript, response, action_taken, type, created_at')
      .eq('user_id', user.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at'),
    supabase
      .from('sessions')
      .select('current_step, completed_steps, last_updated, protocols(name)')
      .eq('user_id', user.id)
      .gte('last_updated', dayStart)
      .lte('last_updated', dayEnd),
    supabase
      .from('samples')
      .select('tube_label, location, notes')
      .eq('user_id', user.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
  ])

  const totalSteps = sessions?.reduce((acc, s) => acc + (s.completed_steps?.length ?? 0), 0) ?? 0
  const protocolsWorked = Array.from(
    new Set(
      (sessions ?? [])
        .map((s) => (s.protocols as unknown as { name: string } | null)?.name)
        .filter(Boolean)
    )
  ) as string[]

  // Build a context string for Claude
  const contextLines: string[] = []
  if (protocolsWorked.length)
    contextLines.push(`Protocols worked on: ${protocolsWorked.join(', ')}`)
  if (totalSteps)
    contextLines.push(`Steps completed: ${totalSteps}`)
  if (samples?.length)
    contextLines.push(`Samples logged: ${samples.map((s) => `${s.tube_label} in ${s.location}`).join(', ')}`)
  if (voiceLogs?.length) {
    const questions = voiceLogs.filter((v) => v.type === 'question').map((v) => v.transcript)
    const commands = voiceLogs.filter((v) => v.type === 'command').map((v) => v.transcript)
    if (questions.length) contextLines.push(`Questions asked: ${questions.join('; ')}`)
    if (commands.length) contextLines.push(`Voice commands used: ${commands.join(', ')}`)
  }

  if (contextLines.length === 0) {
    return NextResponse.json({ summary: null, message: 'No activity for this date' })
  }

  // Generate summary with Claude
  const prompt = `Summarize this lab intern's day in 3-4 sentences. What did they work on? What did they accomplish? What questions did they ask? Be specific and encouraging.\n\nDate: ${date}\n${contextLines.join('\n')}`

  let summaryText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    summaryText = (message.content[0] as { type: string; text: string }).text?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }

  // Upsert into daily_summaries
  await supabase.from('daily_summaries').upsert(
    {
      user_id: user.id,
      date,
      summary: summaryText,
      protocols_worked_on: protocolsWorked,
      steps_completed: totalSteps,
      samples_logged: samples?.length ?? 0,
    },
    { onConflict: 'user_id,date' }
  )

  return NextResponse.json({ summary: summaryText })
}
