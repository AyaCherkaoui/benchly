import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'

interface InterpretContext {
  currentPage: string
  currentStep: string
  protocolName: string
  stepNumber?: number
  totalSteps?: number
}

export async function POST(req: NextRequest) {
  const { transcript, context }: { transcript: string; context: InterpretContext } =
    await req.json()

  const onProtocolPage =
    context.currentPage?.includes('/protocol/') &&
    !context.currentPage?.endsWith('/protocol')

  const protocolContext = onProtocolPage
    ? `- Current protocol: ${context.protocolName}
- Current step: ${context.stepNumber ?? '?'} of ${context.totalSteps ?? '?'} — "${context.currentStep}"`
    : `- Current page: ${context.currentPage}`

  const systemPrompt = `Voice command interpreter for Benchly (lab protocol app). User is hands-free.

${protocolContext}
Pages: /dashboard, /protocol, /samples, /meeting

Return ONLY a JSON object — no other text:
{"action":"next_step"} {"action":"mark_complete"} {"action":"start_timer"} {"action":"pause_timer"}
{"action":"navigate","destination":"/dashboard"} {"action":"navigate","destination":"/samples"}
{"action":"navigate","destination":"/meeting"} {"action":"navigate","destination":"/protocol"}
{"action":"ask_ai","question":"..."} {"action":"exit_handsfree"} {"action":"unknown"}

Rules: "next"/"skip"→next_step | "done"/"finished"/"complete"→mark_complete | "start"/"ready"/"begin"/"go"→start_timer | "pause"/"hold"→pause_timer | "home"/"back"→navigate /dashboard | "exit"/"stop"/"quit"→exit_handsfree | science question→ask_ai. Be generous, prefer known actions over unknown.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
    })

    const raw =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'

    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ action: 'unknown' })
  }
}
