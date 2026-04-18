import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

export async function POST() {
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

  // Guard: don't double-seed
  const { count: existingCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((existingCount ?? 0) > 0) {
    return NextResponse.json({ message: 'User already has session data' })
  }

  // ── 1. Get or create PCR Amplification protocol ─────────────────────────
  let protocolId: string

  const { data: existingProtocol } = await supabase
    .from('protocols')
    .select('id')
    .eq('name', 'PCR Amplification')
    .maybeSingle()

  if (existingProtocol?.id) {
    protocolId = existingProtocol.id
  } else {
    // Try to create (may fail if RLS is strict — fall back to first available)
    const { data: created, error: createErr } = await supabase
      .from('protocols')
      .insert({
        name: 'PCR Amplification',
        description: 'Standard PCR amplification protocol for DNA samples using Taq polymerase.',
      })
      .select('id')
      .single()

    if (createErr || !created) {
      // Fall back: use first protocol available to this user
      const { data: any } = await supabase.from('protocols').select('id').limit(1).single()
      if (!any?.id)
        return NextResponse.json(
          { error: 'No protocols found. Ask your admin to create at least one protocol first.' },
          { status: 400 }
        )
      protocolId = any.id
    } else {
      protocolId = created.id

      // Create 8 PCR steps
      await supabase.from('steps').insert([
        {
          protocol_id: protocolId,
          step_number: 1,
          title: 'Prepare Reagents',
          instructions:
            'Remove all reagents from storage. Allow enzyme and buffer to thaw on ice for 10 minutes. Do not vortex the enzyme — gently flick to mix.',
        },
        {
          protocol_id: protocolId,
          step_number: 2,
          title: 'Prepare DNA Template',
          instructions:
            'Dilute your DNA template to 10–100 ng/μL. Check concentration with NanoDrop. Ensure A260/A280 ratio is between 1.8–2.0.',
        },
        {
          protocol_id: protocolId,
          step_number: 3,
          title: 'Mix PCR Reaction',
          instructions:
            'In a 0.2 mL PCR tube, combine: 12.5 μL 2× master mix, 1 μL forward primer (10 μM), 1 μL reverse primer (10 μM), 1 μL template DNA, 9.5 μL nuclease-free water. Mix gently by pipetting.',
        },
        {
          protocol_id: protocolId,
          step_number: 4,
          title: 'Initial Denaturation',
          instructions:
            'Place tube in thermocycler. Run initial denaturation at 95°C for 5 minutes to fully denature the double-stranded DNA template.',
          timer_seconds: 300,
        },
        {
          protocol_id: protocolId,
          step_number: 5,
          title: 'PCR Cycling (35 cycles)',
          instructions:
            'Run 35 cycles: 95°C for 30 s (denaturation), 55°C for 30 s (annealing), 72°C for 1 min per kb (extension). Total cycling time ≈ 60–90 min.',
          timer_seconds: 3600,
        },
        {
          protocol_id: protocolId,
          step_number: 6,
          title: 'Final Extension',
          instructions:
            'After cycling, run a final extension at 72°C for 10 minutes to complete all partial products and add A-overhangs.',
          timer_seconds: 600,
        },
        {
          protocol_id: protocolId,
          step_number: 7,
          title: 'Hold and Store',
          instructions:
            'Hold at 4°C until ready to analyze. PCR product is stable at 4°C for up to 1 week, or freeze at −20°C for long-term storage.',
        },
        {
          protocol_id: protocolId,
          step_number: 8,
          title: 'Analyze Results',
          instructions:
            'Run 5 μL of PCR product on a 1% agarose gel at 100 V for 30 minutes. Include a 1 kb DNA ladder. Expected band should match your amplicon size.',
        },
      ])
    }
  }

  // Get step count for realistic progress
  const { count: totalSteps } = await supabase
    .from('steps')
    .select('*', { count: 'exact', head: true })
    .eq('protocol_id', protocolId)
  const total = totalSteps ?? 8

  // ── 2. Completed session (3 days ago, all steps done) ─────────────────────
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  await supabase.from('sessions').insert({
    user_id: user.id,
    protocol_id: protocolId,
    current_step: total,
    completed_steps: Array.from({ length: total }, (_, i) => i + 1),
    started_at: new Date(threeDaysAgo.getTime() - 2 * 3600 * 1000).toISOString(),
    last_updated: threeDaysAgo.toISOString(),
  })

  // ── 3. In-progress session (today, halfway through) ────────────────────────
  const midStep = Math.min(Math.ceil(total / 2), total - 1)
  const completedSoFar = Array.from({ length: midStep - 1 }, (_, i) => i + 1)

  await supabase.from('sessions').insert({
    user_id: user.id,
    protocol_id: protocolId,
    current_step: midStep,
    completed_steps: completedSoFar,
    started_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    last_updated: new Date().toISOString(),
  })

  // ── 4. Samples ─────────────────────────────────────────────────────────────
  await supabase.from('samples').insert([
    {
      user_id: user.id,
      sample_id_label: 'SMPL-001',
      tube_label: 'A1',
      location: '-20°C Freezer',
      notes: 'Primary PCR product — run 1',
      protocol_id: protocolId,
    },
    {
      user_id: user.id,
      sample_id_label: 'SMPL-002',
      tube_label: 'A2',
      location: '-20°C Freezer',
      notes: 'Replicate PCR product — run 1',
      protocol_id: protocolId,
    },
    {
      user_id: user.id,
      sample_id_label: 'SMPL-003',
      tube_label: 'B1',
      location: '4°C Fridge',
      notes: 'Working stock, in use',
      protocol_id: protocolId,
    },
    {
      user_id: user.id,
      sample_id_label: 'SMPL-004',
      tube_label: 'B2',
      location: 'PCR Machine',
      notes: 'Currently amplifying — run 2',
      protocol_id: protocolId,
    },
  ])

  // ── 5. Voice logs (5 realistic entries across past 3 days) ───────────────
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  await supabase.from('voice_logs').insert([
    {
      user_id: user.id,
      protocol_id: protocolId,
      type: 'question',
      transcript: 'what does denaturation mean',
      response:
        'Denaturation is when heat (95°C) breaks the hydrogen bonds between DNA base pairs, separating the double helix into two single strands so primers can bind.',
      action_taken: 'ask_ai',
      created_at: new Date(threeDaysAgo.getTime() + 10 * 60 * 1000).toISOString(),
    },
    {
      user_id: user.id,
      protocol_id: protocolId,
      type: 'command',
      transcript: 'mark complete',
      response: 'Got it. Step marked as complete.',
      action_taken: 'mark_complete',
      created_at: new Date(threeDaysAgo.getTime() + 30 * 60 * 1000).toISOString(),
    },
    {
      user_id: user.id,
      protocol_id: protocolId,
      type: 'unknown',
      transcript: 'the bands looked clear and sharp, good results',
      response: null,
      action_taken: 'unknown',
      created_at: new Date(twoDaysAgo.getTime() + 15 * 60 * 1000).toISOString(),
    },
    {
      user_id: user.id,
      protocol_id: protocolId,
      type: 'command',
      transcript: 'log sample tube A1 in minus 20 freezer',
      response: 'Got it. Sample A1 logged in -20°C Freezer.',
      action_taken: 'log_sample',
      created_at: new Date(yesterday.getTime() + 20 * 60 * 1000).toISOString(),
    },
    {
      user_id: user.id,
      protocol_id: protocolId,
      type: 'command',
      transcript: 'start timer',
      response: 'Timer started.',
      action_taken: 'start_timer',
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ])

  return NextResponse.json({ success: true })
}
