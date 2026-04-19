'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

export type BenchlyFunction =
  | { name: 'navigate'; arguments: { destination: string } }
  | { name: 'mark_step_complete'; arguments: Record<string, never> }
  | { name: 'next_step'; arguments: Record<string, never> }
  | { name: 'start_timer'; arguments: Record<string, never> }
  | { name: 'pause_timer'; arguments: Record<string, never> }
  | { name: 'log_sample'; arguments: { tube_label: string; location: string; project_name?: string; experiment_number?: string; notes?: string } }
  | { name: 'add_task'; arguments: { task_text: string; date: string } }
  | { name: 'sign_out'; arguments: Record<string, never> }
  | { name: 'generate_report'; arguments: Record<string, never> }
  | { name: 'read_current_step'; arguments: Record<string, never> }
  | { name: 'show_samples'; arguments: Record<string, never> }

interface UseRealtimeVoiceOptions {
  currentPage?: string
  currentStep?: string
  protocolName?: string
  protocolId?: string
  userName?: string
  onMarkComplete?: () => void
  onNextStep?: () => void
  onStartTimer?: () => void
  onPauseTimer?: () => void
}

export function useRealtimeVoice(options: UseRealtimeVoiceOptions = {}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastAction, setLastAction] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const getSystemPrompt = useCallback(() => {
    const now = new Date()
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    return `You are Benchly, an AI lab assistant living inside a laboratory workflow web app. You are the user's hands-free companion while they work at the bench with gloves on.

TODAY: ${dayName}, ${dateStr}, ${timeOfDay}
CURRENT PAGE: ${options.currentPage || 'dashboard'}
ACTIVE PROTOCOL: ${options.protocolName || 'none'}
CURRENT STEP: ${options.currentStep || 'none'}
USER: ${options.userName || 'the researcher'}

YOUR PERSONALITY:
- You are warm, focused, and efficient — like a brilliant lab partner who's always one step ahead
- You speak in short, natural sentences. Never robotic. Never formal.
- You confirm actions immediately and briefly: "Done." "Got it." "Moving there now."
- You anticipate what the user needs based on context
- You are encouraging without being annoying
- When you don't understand something, you ask ONE short clarifying question
- You never say "I cannot" or "I don't have access to" — you either do it or ask for clarification

YOUR CAPABILITIES (what you can actually do):
1. Navigate anywhere in the app — dashboard, protocols, samples, calendar, lab meeting/summary, team
2. Mark the current protocol step as complete
3. Move to the next or previous step
4. Start, pause, or reset the step timer
5. Log a sample — tube label, location, project, notes
6. Add a task to any day on the calendar
7. Sign the user out
8. Go to the weekly report / generate a report

UNDERSTANDING NATURAL LANGUAGE (examples of what users might say and what they mean):

Navigation:
- "take me home" / "go back" / "main page" / "home screen" → dashboard
- "show me my experiments" / "what protocols do I have" / "lab work" → protocols page
- "my tubes" / "what samples do I have" / "storage" → samples page
- "what's on my calendar" / "my tasks" / "schedule" / "this week" → calendar
- "meeting prep" / "weekly summary" / "report" / "what did I do this week" → meeting
- "my team" / "who's in the lab" → team page

Protocol actions:
- "I'm done" / "finished" / "next one" / "move on" / "that's done" / "check" → mark complete
- "how long" / "start the clock" / "begin timing" / "go" / "I'm ready" → start timer
- "hold on" / "wait" / "stop the clock" / "pause" → pause timer
- "what step am I on" / "where am I" → describe current step

Sample logging:
- "save this" / "log it" / "remember this tube" / "B3 goes in the freezer" → log sample
- Extract tube label from anything that sounds like a label (letters + numbers)
- Extract location: "freezer" = -20°C Freezer, "cold" / "fridge" = 4°C Fridge, "room temp" = Room Temperature, "machine" / "PCR" = PCR Machine

Task adding:
- "remind me to..." / "add to my list" / "I need to do..." / "tomorrow I have to..." → add task
- "next Monday" / "this Friday" / "tomorrow" → extract the date correctly

CONTEXT AWARENESS:
- If the user is on the protocol page and says "I'm done", they mean the current step, not the whole protocol
- If they say "go back", they mean the previous page in the app, not the previous protocol step
- If they mention a number like "step 3" while on the protocol page, they want to jump to step 3
- If they say "how much time left" while a timer is running, describe the timer state
- If they haven't started a protocol and say "let's start", ask which protocol they want to do
- If they sound frustrated or confused, offer to help more specifically

MEMORY WITHIN SESSION:
- Remember everything said in this conversation
- If they mentioned a project name earlier, use it when logging samples later
- If they said they're working on "the CRISPR experiment", refer to it as that
- Track what steps they've completed in this conversation

RESPONSE RULES:
- Maximum 2 sentences for confirmations
- Maximum 4 sentences for explanations
- Never use emojis, bullet points, asterisks, or markdown
- Never repeat the user's exact words back to them
- Never start with "Of course!" or "Certainly!" or "Great question!"
- Start responses directly: "Moving there now." / "Timer started." / "Your sample is logged."
- When executing a function, speak the confirmation naturally as if you already did it

PROACTIVE BEHAVIOR:
- If it's the start of a session and there's an active protocol, offer to resume it
- If a timed step finishes, remind them proactively
- If they've been on the same step for a long time, ask if they need help
- If they log a sample, offer to add a note about what it's for`
  }, [options.currentPage, options.currentStep, options.protocolName, options.userName])

  const transcriptRef = useRef('')

  const handleFunctionCall = useCallback(async (name: string, args: Record<string, unknown>) => {
    console.log('[Realtime] Function call:', name, args)
    setLastAction(name)

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id

    switch (name) {
      case 'navigate': {
        const destination = (args.destination as string || '').toLowerCase()
        const routeMap: Record<string, string> = {
          'dashboard': '/dashboard',
          'protocols': '/protocol',
          'samples': '/samples',
          'calendar': '/log',
          'meeting': '/meeting',
          'team': '/team',
        }
        const route = routeMap[destination] || '/dashboard'
        router.push(route)
        break
      }
      case 'mark_step_complete':
        options.onMarkComplete?.()
        break
      case 'next_step':
        options.onNextStep?.()
        break
      case 'start_timer':
        options.onStartTimer?.()
        break
      case 'pause_timer':
        options.onPauseTimer?.()
        break
      case 'log_sample': {
        if (userId) {
          const { error: insertError } = await supabase.from('samples').insert({
            user_id: userId,
            sample_id_label: `SMPL-${Date.now()}`,
            tube_label: (args.tube_label as string) || 'Unknown',
            location: (args.location as string) || 'Unknown',
            project_name: (args.project_name as string) || null,
            notes: (args.notes as string) || null,
          })
          if (insertError) console.error('Sample log error:', insertError)
        }
        break
      }
      case 'add_task': {
        if (userId) {
          const date = (args.date as string) || new Date().toISOString().split('T')[0]
          const { error: insertError } = await supabase.from('calendar_tasks').insert({
            user_id: userId,
            date,
            task_text: args.task_text as string,
          })
          if (insertError) console.error('Task add error:', insertError)
        }
        break
      }
      case 'sign_out':
        await supabase.auth.signOut()
        router.push('/login')
        break
      case 'generate_report':
        router.push('/meeting')
        break
      case 'read_current_step':
        // AI's spoken response handles this naturally via system prompt context
        break
      case 'show_samples':
        router.push('/samples')
        break
    }

    // Log command to voice_logs
    if (userId) {
      await supabase.from('voice_logs').insert({
        user_id: userId,
        protocol_id: options.protocolId || null,
        type: 'command',
        transcript: transcriptRef.current,
        action_taken: name,
      })
    }
  }, [router, supabase, options]) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async () => {
    try {
      setError(null)

      const tokenRes = await fetch('/api/realtime-token')
      if (!tokenRes.ok) throw new Error('Failed to get realtime token')
      const { client_secret } = await tokenRes.json()

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      const audio = new Audio()
      audio.autoplay = true
      audioRef.current = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
        setVoiceState('speaking')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setIsConnected(true)
        setVoiceState('listening')

        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: getSystemPrompt(),
            voice: 'shimmer',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.4,
              prefix_padding_ms: 200,
              silence_duration_ms: 400,
            },
            tools: [
              {
                type: 'function',
                name: 'navigate',
                description: 'Navigate to a different page. Use when user wants to go somewhere, see something, or switch sections.',
                parameters: {
                  type: 'object',
                  properties: {
                    destination: {
                      type: 'string',
                      enum: ['dashboard', 'protocols', 'samples', 'calendar', 'meeting', 'team'],
                      description: 'Where to go',
                    },
                  },
                  required: ['destination'],
                },
              },
              {
                type: 'function',
                name: 'mark_step_complete',
                description: 'Mark the current protocol step as complete. Use when user says they are done, finished, or ready to move on.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'next_step',
                description: 'Advance to the next protocol step without marking current as complete.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'start_timer',
                description: 'Start the countdown timer for the current step. Use when user says ready, start, go, begin, or asks to start timing.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'pause_timer',
                description: 'Pause the current step timer.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'log_sample',
                description: 'Save a sample to the sample tracker. Extract tube label and location from natural speech.',
                parameters: {
                  type: 'object',
                  properties: {
                    tube_label: {
                      type: 'string',
                      description: 'The tube or sample identifier, e.g. B3, Sample-1, PCR-tube-A',
                    },
                    location: {
                      type: 'string',
                      enum: ['-20°C Freezer', '-80°C Freezer', '4°C Fridge', 'Room Temperature', 'Incubator', 'PCR Machine', 'Other'],
                      description: 'Where the sample is stored',
                    },
                    project_name: {
                      type: 'string',
                      description: 'Project this sample belongs to',
                    },
                    experiment_number: {
                      type: 'string',
                      description: 'Experiment number like PCR-003',
                    },
                    notes: {
                      type: 'string',
                      description: 'Any observations or notes about this sample',
                    },
                  },
                  required: ['tube_label', 'location'],
                },
              },
              {
                type: 'function',
                name: 'add_task',
                description: 'Add a task or reminder to the calendar. Use when user says remind me, I need to, add to my list, or mentions something they need to do.',
                parameters: {
                  type: 'object',
                  properties: {
                    task_text: {
                      type: 'string',
                      description: 'What the task is',
                    },
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format. Default to today if not specified.',
                    },
                  },
                  required: ['task_text', 'date'],
                },
              },
              {
                type: 'function',
                name: 'sign_out',
                description: 'Sign the user out of Benchly.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'generate_report',
                description: 'Go to the lab meeting page to generate or view the weekly report.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'read_current_step',
                description: 'Read out the current protocol step instructions to the user.',
                parameters: { type: 'object', properties: {} },
              },
              {
                type: 'function',
                name: 'show_samples',
                description: 'Read out the user recent samples or go to samples page.',
                parameters: { type: 'object', properties: {} },
              },
            ],
            tool_choice: 'auto',
          },
        }))

        // Contextual greeting after session is configured
        setTimeout(() => {
          if (dc.readyState === 'open') {
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: '[SYSTEM: The user just activated you. Greet them briefly and naturally based on the time of day and current context. If they have an active protocol, mention it. Keep it to one sentence. Be warm but not over the top.]',
                }],
              },
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
          }
        }, 800)
      }

      dc.onmessage = async (e) => {
        const event = JSON.parse(e.data)
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id

        switch (event.type) {
          case 'input_audio_buffer.speech_started':
            setVoiceState('listening')
            if (audioRef.current) audioRef.current.srcObject = null
            break

          case 'response.created':
            setVoiceState('thinking')
            break

          case 'response.audio.started':
            setVoiceState('speaking')
            break

          case 'conversation.item.input_audio_transcription.completed': {
            const userText = event.transcript || ''
            transcriptRef.current = userText
            setTranscript(userText)
            // Save user's speech to voice_logs
            if (userId && userText) {
              await supabase.from('voice_logs').insert({
                user_id: userId,
                protocol_id: options.protocolId || null,
                type: 'question',
                transcript: userText,
              })
            }
            break
          }

          case 'response.audio_transcript.done': {
            // Save Benchly's spoken response
            if (userId && event.transcript) {
              await supabase.from('voice_logs').insert({
                user_id: userId,
                protocol_id: options.protocolId || null,
                type: 'response',
                transcript: event.transcript,
              })
            }
            break
          }

          case 'response.function_call_arguments.done': {
            const args = JSON.parse(event.arguments || '{}')
            await handleFunctionCall(event.name, args)
            if (dcRef.current?.readyState === 'open') {
              dcRef.current.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: event.call_id,
                  output: JSON.stringify({ success: true }),
                },
              }))
              dcRef.current.send(JSON.stringify({ type: 'response.create' }))
            }
            break
          }

          case 'response.done':
            setVoiceState('listening')
            break

          case 'error':
            console.error('[Realtime] Error:', event.error)
            setError(event.error?.message || 'Voice error')
            setVoiceState('idle')
            break
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${client_secret.value}`,
            'Content-Type': 'application/sdp',
          },
        }
      )

      const answer = { type: 'answer' as RTCSdpType, sdp: await sdpRes.text() }
      await pc.setRemoteDescription(answer)

    } catch (err) {
      console.error('[Realtime] Connection error:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setVoiceState('idle')
    }
  }, [getSystemPrompt, handleFunctionCall]) // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    dcRef.current?.close()
    pcRef.current?.close()
    pcRef.current = null
    dcRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    setIsConnected(false)
    setVoiceState('idle')
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return {
    voiceState,
    isConnected,
    transcript,
    lastAction,
    error,
    connect,
    disconnect,
  }
}
