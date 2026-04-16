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

  const systemPrompt = `You are a voice command interpreter for Benchly, a lab protocol management app.
The user is hands-free in a lab and just spoke a voice command.

${protocolContext}
- Available pages: dashboard (/dashboard), protocols (/protocol), samples (/samples), lab meeting (/meeting)

Your job: interpret what the user wants and return ONLY a JSON object with no other text.

Possible actions:
- { "action": "next_step" } — advance to the next step without marking complete
- { "action": "mark_complete" } — mark current step done and advance
- { "action": "start_timer" } — start or resume the step timer
- { "action": "pause_timer" } — pause the step timer
- { "action": "navigate", "destination": "/dashboard" }
- { "action": "navigate", "destination": "/samples" }
- { "action": "navigate", "destination": "/meeting" }
- { "action": "navigate", "destination": "/protocol" }
- { "action": "ask_ai", "question": "the user's question" } — a lab/science question
- { "action": "exit_handsfree" } — stop hands-free mode
- { "action": "unknown" } — genuinely cannot determine intent

Interpretation guide:
- "next step", "skip" → next_step
- "done", "finished", "complete", "mark complete", "I'm done", "step done" → mark_complete
- "start", "ready", "begin", "go", "start timer", "ready to start" → start_timer
- "pause", "pause timer", "stop timer", "hold on" → pause_timer
- "home", "main page", "go back", "dashboard" → navigate /dashboard
- "samples", "sample tracker" → navigate /samples
- "meeting", "lab meeting" → navigate /meeting
- "protocols", "protocol list" → navigate /protocol
- "exit", "stop", "stop listening", "turn off", "deactivate", "quit" → exit_handsfree
- Any science/lab question → ask_ai
- Natural phrasing ("can you take me to…", "show me…", "what is…") should work

Be generous. Err toward a recognised action over "unknown".`

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
