'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface UseDemoVoiceOptions {
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

export function useDemoVoice(options: UseDemoVoiceOptions = {}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastAction, setLastAction] = useState('')
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const isConnectedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const historyRef = useRef<Array<{ role: string; content: string }>>([])
  const processRef = useRef<((text: string) => Promise<void>) | null>(null)

  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const getSystemPrompt = useCallback(() => {
    const now = new Date()
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    return `You are Benchly, an AI lab assistant inside a laboratory workflow web app. You are the user's hands-free companion while they work at the bench with gloves on.

TODAY: ${dayName}, ${dateStr}, ${timeOfDay}
CURRENT PAGE: ${options.currentPage || 'dashboard'}
ACTIVE PROTOCOL: ${options.protocolName || 'none'}
CURRENT STEP: ${options.currentStep || 'none'}
USER: ${options.userName || 'the researcher'}

YOUR PERSONALITY:
- Warm, focused, efficient — like a brilliant lab partner who's always one step ahead
- Short, natural sentences. Never robotic or formal.
- Confirm actions immediately: "Done." "Got it." "Moving there now."
- Never say "I cannot" or "I don't have access to"

NAVIGATION: dashboard, protocols, samples, calendar, meeting, team pages
PROTOCOL: mark steps complete, next step, start/pause timer
SAMPLES: log tube label + location
TASKS: add to calendar
REPORTS: generate weekly lab summary

RESPONSE RULES:
- Maximum 2 sentences for confirmations, 4 for explanations
- No emojis, bullet points, asterisks, or markdown
- Never start with "Of course!" or "Certainly!" or "Great question!"
- Start directly: "Moving there now." / "Timer started." / "Your sample is logged."`
  }, [options.currentPage, options.currentStep, options.protocolName, options.userName])

  const handleFunctionCall = useCallback(async (name: string, args: Record<string, unknown>) => {
    setLastAction(name)
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id

    switch (name) {
      case 'navigate': {
        const routeMap: Record<string, string> = {
          dashboard: '/dashboard', protocols: '/protocol', samples: '/samples',
          calendar: '/log', meeting: '/meeting', team: '/team',
        }
        router.push(routeMap[(args.destination as string)?.toLowerCase()] || '/dashboard')
        break
      }
      case 'mark_step_complete': options.onMarkComplete?.(); break
      case 'next_step': options.onNextStep?.(); break
      case 'start_timer': options.onStartTimer?.(); break
      case 'pause_timer': options.onPauseTimer?.(); break
      case 'log_sample':
        if (userId) {
          await supabase.from('samples').insert({
            user_id: userId,
            sample_id_label: `SMPL-${Date.now()}`,
            tube_label: (args.tube_label as string) || 'Unknown',
            location: (args.location as string) || 'Unknown',
            project_name: (args.project_name as string) || null,
            notes: (args.notes as string) || null,
          })
        }
        break
      case 'add_task':
        if (userId) {
          await supabase.from('calendar_tasks').insert({
            user_id: userId,
            date: (args.date as string) || new Date().toISOString().split('T')[0],
            task_text: args.task_text as string,
          })
        }
        break
      case 'sign_out':
        await supabase.auth.signOut()
        router.push('/login')
        break
      case 'generate_report': router.push('/meeting'); break
      case 'show_samples': router.push('/samples'); break
    }
  }, [router, supabase, options]) // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (!isConnectedRef.current || isProcessingRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript.trim()
      if (text) processRef.current?.(text)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' && isConnectedRef.current && !isProcessingRef.current) {
        setTimeout(startListening, 150)
      } else if (e.error !== 'aborted') {
        console.error('[Demo] Speech recognition error:', e.error)
      }
    }

    recognition.onend = () => {
      // restart handled by processRef or onerror
    }

    try {
      recognition.start()
      setVoiceState('listening')
    } catch (e) {
      console.error('[Demo] Failed to start recognition:', e)
    }
  }, [])

  const processUserInput = useCallback(async (text: string) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    recognitionRef.current?.stop()
    setVoiceState('thinking')
    setTranscript(text)

    historyRef.current.push({ role: 'user', content: text })

    try {
      const chatRes = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current, systemPrompt: getSystemPrompt() }),
      })

      if (!chatRes.ok) throw new Error(`Chat failed: ${chatRes.status}`)
      const { response, functionCall } = await chatRes.json()

      if (functionCall) await handleFunctionCall(functionCall.name, functionCall.args)

      if (response) {
        historyRef.current.push({ role: 'assistant', content: response })
        setVoiceState('speaking')

        const speakRes = await fetch('/api/demo-speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: response }),
        })

        if (speakRes.ok) {
          const blob = await speakRes.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => {
            URL.revokeObjectURL(url)
            isProcessingRef.current = false
            if (isConnectedRef.current) startListening()
          }
          audio.onerror = () => {
            URL.revokeObjectURL(url)
            isProcessingRef.current = false
            if (isConnectedRef.current) startListening()
          }
          await audio.play()
        } else {
          isProcessingRef.current = false
          if (isConnectedRef.current) startListening()
        }
      } else {
        isProcessingRef.current = false
        if (isConnectedRef.current) startListening()
      }
    } catch (err) {
      console.error('[Demo] Error:', err)
      isProcessingRef.current = false
      if (isConnectedRef.current) startListening()
    }
  }, [getSystemPrompt, handleFunctionCall, startListening])

  useEffect(() => { processRef.current = processUserInput }, [processUserInput])

  const connect = useCallback(async () => {
    setError(null)
    isConnectedRef.current = true
    historyRef.current = []
    isProcessingRef.current = false
    setIsConnected(true)
    setVoiceState('thinking')

    await processUserInput(
      '[SYSTEM: The user just activated Benchly. Greet them briefly and naturally based on time of day and context. One sentence max. Be warm but not over the top. No tool calls for this.]'
    )
  }, [processUserInput])

  const disconnect = useCallback(() => {
    isConnectedRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    historyRef.current = []
    isProcessingRef.current = false
    setIsConnected(false)
    setVoiceState('idle')
  }, [])

  useEffect(() => {
    return () => {
      isConnectedRef.current = false
      recognitionRef.current?.stop()
    }
  }, [])

  return { voiceState, isConnected, transcript, lastAction, error, connect, disconnect }
}
