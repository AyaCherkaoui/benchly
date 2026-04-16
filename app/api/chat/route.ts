import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { message, currentStep } = await req.json()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are Benchly, an AI lab assistant helping a beginner intern complete lab protocols safely. You are currently helping with this step: ${currentStep}. Keep answers short, clear, and beginner-friendly. Never use jargon without explaining it.`,
    messages: [
      {
        role: 'user',
        content: message,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({ reply: text })
}
