import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'

interface InterpretContext {
  currentPage: string
  currentStep: string
  protocolName: string
}

export async function POST(req: NextRequest) {
  const { transcript, context }: { transcript: string; context: InterpretContext } =
    await req.json()

  const systemPrompt = `You are a voice command interpreter for Benchly, a lab protocol management app.
The user is hands-free in a lab and just spoke a voice command.

Current context:
- Current page: ${context.currentPage}
- Current protocol step: ${context.currentStep}
- Protocol name: ${context.protocolName}
- Available pages: dashboard, protocol walker, samples, lab meeting

Your job is to interpret what the user wants and return ONLY a JSON object with no other text.

Possible actions:
- { "action": "next_step" } — user wants to advance to the next step
- { "action": "mark_complete" } — user wants to mark current step as done
- { "action": "start_timer" } — user wants to start the timer
- { "action": "pause_timer" } — user wants to pause the timer
- { "action": "navigate", "destination": "/dashboard" } — user wants to go somewhere
- { "action": "navigate", "destination": "/samples" }
- { "action": "navigate", "destination": "/meeting" }
- { "action": "navigate", "destination": "/protocol" }
- { "action": "ask_ai", "question": "the user's question" } — user is asking a lab question
- { "action": "exit_handsfree" } — user wants to stop hands-free mode, exit, turn off listening
- { "action": "unknown" } — you genuinely cannot determine intent

Be generous in interpretation. "main page", "home", "go back" = dashboard. "I'm done", "finished", "completed" = mark_complete. Any science question = ask_ai. "exit", "stop listening", "turn off", "deactivate", "quit hands-free", "stop" = exit_handsfree. Natural phrasing like "can you take me to..." or "show me..." should work.`

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
    // Always return a valid response — caller handles 'unknown'
    return NextResponse.json({ action: 'unknown' })
  }
}
