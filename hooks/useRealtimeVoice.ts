'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

export type BenchlyFunction =
  | { name: 'navigate'; arguments: { path: string } }
  | { name: 'mark_step_complete'; arguments: {} }
  | { name: 'next_step'; arguments: {} }
  | { name: 'start_timer'; arguments: {} }
  | { name: 'pause_timer'; arguments: {} }
  | { name: 'log_sample'; arguments: { tube_label: string; location: string; project_name?: string; notes?: string } }
  | { name: 'add_task'; arguments: { task_text: string; date?: string } }
  | { name: 'sign_out'; arguments: {} }
  | { name: 'generate_report'; arguments: {} }

interface UseRealtimeVoiceOptions {
  currentPage?: string
  currentStep?: string
  protocolName?: string
  protocolId?: string
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
    const page = options.currentPage || 'dashboard'
    const step = options.currentStep || ''
    const protocol = options.protocolName || ''

    return `You are Benchly, an intelligent AI lab assistant embedded in a laboratory workflow app. You help lab interns and researchers work hands-free while they conduct experiments.

Current context:
- Page: ${page}
- Protocol: ${protocol || 'none active'}
- Current step: ${step || 'none'}

Your personality:
- Warm, encouraging, and professional
- Concise — keep responses under 2 sentences unless explaining something complex
- Smart — understand what the user means even if they phrase it awkwardly
- Proactive — if you know what page they're on, reference it naturally

What you can do:
- Navigate to any page in the app (dashboard, protocols, samples, daily log, lab meeting, team)
- Mark the current protocol step as complete
- Advance to the next step
- Start or pause the step timer
- Log a sample with tube label and location
- Add a task to the calendar
- Sign the user out
- Generate the weekly report

Rules:
- Never use emojis or special characters
- Write in plain conversational prose
- When you call a function, briefly confirm what you did: "Got it, moving to the next step." or "Logged your sample in the minus 20 freezer."
- If you don't understand something, ask one clarifying question
- Always call the appropriate function when the user requests an action — don't just describe what you would do, actually call it`
  }, [options.currentPage, options.currentStep, options.protocolName])

  const transcriptRef = useRef('')

  const handleFunctionCall = useCallback(async (name: string, args: Record<string, unknown>) => {
    console.log('[Realtime] Function call:', name, args)
    setLastAction(name)

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id

    switch (name) {
      case 'navigate': {
        const path = args.path as string
        const pathMap: Record<string, string> = {
          'dashboard': '/dashboard',
          'home': '/dashboard',
          'protocols': '/protocol',
          'protocol': '/protocol',
          'samples': '/samples',
          'daily log': '/log',
          'calendar': '/log',
          'log': '/log',
          'lab meeting': '/meeting',
          'meeting': '/meeting',
          'report': '/meeting',
          'team': '/team',
        }
        const normalized = path.toLowerCase()
        const route = pathMap[normalized] || path
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
          const { error } = await supabase.from('samples').insert({
            user_id: userId,
            sample_id_label: `SMPL-${Date.now()}`,
            tube_label: (args.tube_label as string) || 'Unknown',
            location: (args.location as string) || 'Unknown',
            project_name: (args.project_name as string) || null,
            notes: (args.notes as string) || null,
          })
          if (error) console.error('Sample log error:', error)
        }
        break
      }
      case 'add_task': {
        if (userId) {
          const date = (args.date as string) || new Date().toISOString().split('T')[0]
          const { error } = await supabase.from('calendar_tasks').insert({
            user_id: userId,
            date,
            task_text: args.task_text as string,
          })
          if (error) console.error('Task add error:', error)
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
    }

    // Log to voice_logs
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

      // Get ephemeral token from our server
      const tokenRes = await fetch('/api/realtime-token')
      if (!tokenRes.ok) throw new Error('Failed to get realtime token')
      const { client_secret } = await tokenRes.json()

      // Create peer connection
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Set up audio output
      const audio = new Audio()
      audio.autoplay = true
      audioRef.current = audio
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
        setVoiceState('speaking')
      }

      // Add microphone input
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // Set up data channel for events
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setIsConnected(true)
        setVoiceState('listening')

        // Configure the session
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: getSystemPrompt(),
            voice: 'nova',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            tools: [
              {
                type: 'function',
                name: 'navigate',
                description: 'Navigate to a different page in the app',
                parameters: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'The page name: dashboard, protocols, samples, daily log, lab meeting, team' }
                  },
                  required: ['path']
                }
              },
              {
                type: 'function',
                name: 'mark_step_complete',
                description: 'Mark the current protocol step as complete and advance to the next step',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'next_step',
                description: 'Move to the next step in the protocol',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'start_timer',
                description: 'Start the timer for the current step',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'pause_timer',
                description: 'Pause the current step timer',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'log_sample',
                description: 'Log a sample to the sample tracker',
                parameters: {
                  type: 'object',
                  properties: {
                    tube_label: { type: 'string', description: 'The tube or sample label' },
                    location: { type: 'string', description: 'Where the sample is stored, e.g. minus 20 freezer, 4C fridge, PCR machine' },
                    project_name: { type: 'string', description: 'The project this sample belongs to' },
                    notes: { type: 'string', description: 'Any notes about the sample' }
                  },
                  required: ['tube_label', 'location']
                }
              },
              {
                type: 'function',
                name: 'add_task',
                description: 'Add a task to the calendar',
                parameters: {
                  type: 'object',
                  properties: {
                    task_text: { type: 'string', description: 'The task description' },
                    date: { type: 'string', description: 'The date in YYYY-MM-DD format, defaults to today' }
                  },
                  required: ['task_text']
                }
              },
              {
                type: 'function',
                name: 'sign_out',
                description: 'Sign the user out of Benchly',
                parameters: { type: 'object', properties: {} }
              },
              {
                type: 'function',
                name: 'generate_report',
                description: 'Navigate to the lab meeting page to generate the weekly report',
                parameters: { type: 'object', properties: {} }
              }
            ],
            tool_choice: 'auto',
          }
        }))
      }

      dc.onmessage = async (e) => {
        const event = JSON.parse(e.data)

        switch (event.type) {
          case 'input_audio_buffer.speech_started':
            setVoiceState('listening')
            // Stop current audio if speaking (interruption)
            if (audioRef.current) {
              audioRef.current.srcObject = null
            }
            break

          case 'response.created':
            setVoiceState('thinking')
            break

          case 'response.audio.started':
            setVoiceState('speaking')
            break

          case 'conversation.item.input_audio_transcription.completed':
            transcriptRef.current = event.transcript || ''
            setTranscript(event.transcript || '')
            break

          case 'response.function_call_arguments.done': {
            const args = JSON.parse(event.arguments || '{}')
            await handleFunctionCall(event.name, args)
            // Send function result back
            if (dcRef.current?.readyState === 'open') {
              dcRef.current.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: event.call_id,
                  output: JSON.stringify({ success: true })
                }
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

      // Create and send SDP offer
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
  }, [getSystemPrompt, handleFunctionCall])

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
