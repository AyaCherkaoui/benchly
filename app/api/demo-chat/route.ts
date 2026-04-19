import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate',
    description: 'Navigate to a different page in the app.',
    input_schema: {
      type: 'object' as const,
      properties: {
        destination: {
          type: 'string',
          enum: ['dashboard', 'protocols', 'samples', 'calendar', 'meeting', 'team'],
        },
      },
      required: ['destination'],
    },
  },
  {
    name: 'mark_step_complete',
    description: 'Mark the current protocol step as complete.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'next_step',
    description: 'Advance to the next protocol step.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'start_timer',
    description: 'Start the countdown timer for the current step.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'pause_timer',
    description: 'Pause the current step timer.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'log_sample',
    description: 'Save a sample to the sample tracker.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tube_label: { type: 'string' },
        location: {
          type: 'string',
          enum: ['-20°C Freezer', '-80°C Freezer', '4°C Fridge', 'Room Temperature', 'Incubator', 'PCR Machine', 'Other'],
        },
        project_name: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['tube_label', 'location'],
    },
  },
  {
    name: 'add_task',
    description: 'Add a task to the calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_text: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD format' },
      },
      required: ['task_text', 'date'],
    },
  },
  {
    name: 'sign_out',
    description: 'Sign the user out.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'generate_report',
    description: 'Go to the meeting page to generate the weekly report.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'show_samples',
    description: 'Navigate to the samples page.',
    input_schema: { type: 'object' as const, properties: {} },
  },
]

export async function POST(req: Request) {
  const { messages, systemPrompt } = await req.json()

  const claudeMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const fullSystem = systemPrompt + '\n\nWhen calling a tool, ALWAYS also include a short spoken confirmation (1 sentence) so the user hears what you did. No markdown, no bullet points, no emojis.'

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: fullSystem,
    messages: claudeMessages,
    tools: TOOLS,
  })

  const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined
  const toolBlock = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined

  return Response.json({
    response: textBlock?.text ?? '',
    functionCall: toolBlock ? { name: toolBlock.name, args: toolBlock.input } : null,
  })
}
