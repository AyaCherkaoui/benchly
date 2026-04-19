'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDemoVoice as useRealtimeVoice } from '@/hooks/useDemoVoice'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export default function BenchlyMic() {
  const pathname = usePathname()
  const { currentStepTitle, protocolName, protocolId, onNextStep, onMarkComplete, onStartTimer, onPauseTimer } = useProtocolSession()
  const [hovered, setHovered] = useState(false)
  const [userName, setUserName] = useState('')
  const [isWakeListening, setIsWakeListening] = useState(false)

  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle().then(({ data }) => {
        const first = data?.full_name?.split(' ')[0]
          || (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
          || user.email?.split('@')[0]
          || ''
        setUserName(first)
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    voiceState,
    isConnected,
    error,
    connect,
    disconnect,
  } = useRealtimeVoice({
    currentPage: pathname,
    currentStep: currentStepTitle,
    protocolName,
    protocolId,
    userName,
    onMarkComplete,
    onNextStep,
    onStartTimer,
    onPauseTimer,
  })

  // Keep a stable ref to connect so the wake word effect doesn't restart on every render
  const connectRef = useRef(connect)
  useEffect(() => { connectRef.current = connect }, [connect])

  // Always-on wake word listener — runs independently of the Realtime connection
  useEffect(() => {
    if (typeof window === 'undefined') return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (isConnected) {
      setIsWakeListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeRecognition: any = null
    let isWakeActive = false
    let cancelled = false

    const startWakeListener = () => {
      if (cancelled || isWakeActive) return

      wakeRecognition = new SpeechRecognition()
      wakeRecognition.continuous = false
      wakeRecognition.interimResults = false
      wakeRecognition.lang = 'en-US'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wakeRecognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript.toLowerCase()
        console.log('[Wake] Heard:', text)

        if (
          text.includes('hey benchly') ||
          text.includes('hi benchly') ||
          text.includes('hello benchly') ||
          text.startsWith('benchly') ||
          text.includes('hey bently') ||
          text.includes('hey bentley')
        ) {
          console.log('[Wake] Wake word detected — connecting...')
          connectRef.current()
        }
      }

      wakeRecognition.onend = () => {
        isWakeActive = false
        setIsWakeListening(false)
        if (!cancelled) setTimeout(startWakeListener, 300)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wakeRecognition.onerror = (e: any) => {
        isWakeActive = false
        setIsWakeListening(false)
        if (cancelled) return
        const delay = (e.error !== 'no-speech' && e.error !== 'aborted') ? 1000 : 300
        setTimeout(startWakeListener, delay)
      }

      try {
        wakeRecognition.start()
        isWakeActive = true
        setIsWakeListening(true)
      } catch {
        isWakeActive = false
      }
    }

    const timer = setTimeout(startWakeListener, 1000)

    return () => {
      cancelled = true
      clearTimeout(timer)
      wakeRecognition?.abort()
      setIsWakeListening(false)
    }
  }, [isConnected])

  const handleToggle = () => {
    if (isConnected) disconnect()
    else connect()
  }

  const dotColor =
    !isConnected ? '#444' :
    voiceState === 'listening' ? '#1D9E75' :
    voiceState === 'speaking' ? '#e8a598' :
    voiceState === 'thinking' ? '#f59e0b' :
    '#444'

  const dotPulse = voiceState === 'speaking' && isConnected

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 20,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: 64,
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: '4px 10px',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: '#888',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}
          >
            Talk to Benchly
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button + waves container */}
      <div style={{ position: 'relative', width: 56, height: 56 }}>

        {/* Wake word breathing ring */}
        {isWakeListening && !isConnected && (
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.08, 0.2, 0.08] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: -5,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Speaking rings */}
        {voiceState === 'speaking' && isConnected && [0, 1].map(i => (
          <motion.div
            key={i}
            animate={{ scale: [1, 2.2], opacity: [0.25, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' as const }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1px solid #e8a598',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Mic wave SVG — left and right arcs */}
        <svg
          width="80"
          height="56"
          style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}
          viewBox="-40 -28 80 56"
        >
          <motion.path
            d="M -32 -10 Q -40 0 -32 10"
            stroke="#e8a598"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            animate={{ opacity: isConnected ? [0.2, 0.8, 0.2] : 0.15 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.path
            d="M 32 -10 Q 40 0 32 10"
            stroke="#e8a598"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            animate={{ opacity: isConnected ? [0.2, 0.8, 0.2] : 0.15 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
        </svg>

        {/* Main button */}
        <motion.button
          onClick={handleToggle}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          animate={{
            borderColor: isConnected
              ? voiceState === 'listening' ? '#1D9E75'
              : voiceState === 'speaking' ? '#e8a598'
              : voiceState === 'thinking' ? '#f59e0b'
              : '#333'
              : isWakeListening ? '#4a4a4a' : '#333',
            scale: voiceState === 'listening' && isConnected
              ? [0.96, 1.04, 0.96]
              : isWakeListening && !isConnected
              ? [0.99, 1.01, 0.99]
              : 1,
          }}
          transition={{
            borderColor: { duration: 0.3 },
            scale: {
              duration: isWakeListening && !isConnected ? 3 : 0.9,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#0d0d0d',
            border: '1.5px solid #333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 1,
            overflow: 'hidden',
            padding: 0,
            boxShadow: isConnected && voiceState === 'listening'
              ? '0 0 16px rgba(29,158,117,0.2)'
              : isConnected && voiceState === 'speaking'
              ? '0 0 16px rgba(232,165,152,0.2)'
              : 'none',
          }}
        >
          <img
            src="/benchly-logo.svg"
            alt="Benchly"
            width={38}
            height={38}
            style={{ objectFit: 'contain', display: 'block' }}
          />
        </motion.button>

        {/* Status dot */}
        <motion.div
          animate={dotPulse ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : { scale: 1, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            border: '1.5px solid #0d0d0d',
            zIndex: 2,
          }}
        />
      </div>

      {/* Wake word hint */}
      <AnimatePresence>
        {isWakeListening && !isConnected && !hovered && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.4 }}
            style={{
              fontSize: 9,
              color: '#3a3a3a',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            say hey benchly
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute',
          top: 64,
          right: 0,
          background: '#2a1111',
          border: '1px solid #f87171',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 11,
          color: '#f87171',
          maxWidth: 220,
          whiteSpace: 'pre-wrap' as const,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
