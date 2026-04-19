'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export default function BenchlyMic() {
  const pathname = usePathname()
  const { currentStepTitle, protocolName, protocolId, onNextStep, onMarkComplete, onStartTimer, onPauseTimer } = useProtocolSession()
  const [hovered, setHovered] = useState(false)
  const [userName, setUserName] = useState('')

  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => {
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
              : '#333',
            scale: voiceState === 'listening' && isConnected ? [0.96, 1.04, 0.96] : 1,
          }}
          transition={{
            borderColor: { duration: 0.3 },
            scale: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
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
    </div>
  )
}
