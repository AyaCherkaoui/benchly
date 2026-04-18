'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice'
import { useProtocolSession } from '@/contexts/ProtocolSessionContext'
import { usePathname } from 'next/navigation'

export default function BenchlyMic() {
  const pathname = usePathname()
  const { currentStepTitle, protocolName, protocolId, onNextStep, onMarkComplete, onStartTimer, onPauseTimer } = useProtocolSession()

  const {
    voiceState,
    isConnected,
    transcript,
    error,
    connect,
    disconnect,
  } = useRealtimeVoice({
    currentPage: pathname,
    currentStep: currentStepTitle,
    protocolName,
    protocolId,
    onMarkComplete,
    onNextStep,
    onStartTimer,
    onPauseTimer,
  })

  const handleToggle = () => {
    if (isConnected) {
      disconnect()
    } else {
      connect()
    }
  }


  const colors = {
    idle: '#333333',
    listening: '#1D9E75',
    thinking: '#e8a598',
    speaking: '#e8a598',
  }

  const labels = {
    idle: "TAP TO ACTIVATE",
    listening: "LISTENING...",
    thinking: "THINKING...",
    speaking: "SPEAKING...",
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(32px + env(safe-area-inset-bottom))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      {/* Transcript pill */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 12,
              color: '#888',
              maxWidth: 280,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {transcript}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rings for speaking state */}
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        {voiceState === 'speaking' && [0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ scale: [1, 2.5], opacity: [0.3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' as const }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1px solid #e8a598',
            }}
          />
        ))}

        {/* Main button */}
        <motion.button
          onClick={handleToggle}
          animate={{
            scale: voiceState === 'idle' ? [0.97, 1.03, 0.97] :
                   voiceState === 'listening' ? [0.95, 1.08, 0.95] : 1,
            borderColor: isConnected ? colors[voiceState] : '#333',
          }}
          transition={{
            scale: {
              duration: voiceState === 'listening' ? 0.8 : 3,
              repeat: Infinity,
              ease: 'easeInOut',
            },
            borderColor: { duration: 0.3 }
          }}
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: '#0d0d0d',
            border: `1.5px solid ${isConnected ? colors[voiceState] : '#333'}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isConnected && voiceState === 'listening'
              ? '0 0 20px rgba(29,158,117,0.2)'
              : voiceState === 'speaking'
              ? '0 0 20px rgba(232,165,152,0.2)'
              : 'none',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="2" width="6" height="12" rx="3"
              fill={isConnected ? colors[voiceState] : '#555'} />
            <path d="M5 10a7 7 0 0 0 14 0"
              stroke={isConnected ? colors[voiceState] : '#555'}
              strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="19" x2="12" y2="22"
              stroke={isConnected ? colors[voiceState] : '#555'}
              strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="22" x2="16" y2="22"
              stroke={isConnected ? colors[voiceState] : '#555'}
              strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>

      {/* Label */}
      <motion.span
        animate={{ opacity: 1 }}
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          color: isConnected ? colors[voiceState] : '#444',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          userSelect: 'none',
        }}
      >
        {isConnected ? labels[voiceState] : "SAY 'HEY BENCHLY'"}
      </motion.span>

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 100,
          background: '#2a1111',
          border: '1px solid #f87171',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          color: '#f87171',
          whiteSpace: 'nowrap',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
