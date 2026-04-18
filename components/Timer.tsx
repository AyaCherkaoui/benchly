'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { speakText } from '@/lib/speak'

export interface TimerHandle {
  start(): void
  pause(): void
}

interface TimerProps {
  seconds: number
  onComplete?: () => void
}

const Timer = forwardRef<TimerHandle, TimerProps>(function Timer({ seconds, onComplete }, ref) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useImperativeHandle(ref, () => ({
    start() { setStarted(true); setRunning(true) },
    pause() { setRunning(false) },
  }))

  useEffect(() => {
    setTimeLeft(seconds); setRunning(false); setStarted(false); setDone(false)
  }, [seconds])

  useEffect(() => {
    if (!running) return
    if (timeLeft <= 0) {
      setRunning(false); setDone(true)
      // Beep
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 660
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1)
      } catch { /* ignore */ }
      toast.success('Timer complete! Check your sample.')
      speakText('Timer complete. Check your sample and let me know when you are ready to continue.')
      onCompleteRef.current?.()
      return
    }
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearInterval(id)
  }, [running, timeLeft])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  function reset() {
    setTimeLeft(seconds); setRunning(false); setStarted(false); setDone(false)
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between rounded-lg px-5 py-4"
        style={{ background: 'rgba(232,165,152,0.06)', border: '1px solid rgba(232,165,152,0.3)' }}
      >
        <span
          className="font-mono text-3xl sm:text-5xl font-light"
          style={{ color: 'var(--accent)', letterSpacing: '0.05em' }}
        >
          COMPLETE
        </span>
        <button
          onClick={reset}
          className="rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Reset Timer
        </button>
      </motion.div>
    )
  }

  if (!started) {
    const totalMins = Math.round(seconds / 60)
    return (
      <div className="flex items-center justify-between rounded-lg px-5 py-4" style={{ background: '#0f0f0f', border: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {totalMins} minute timer
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.04em' }}>
            Say &ldquo;start timer&rdquo; or click when ready
          </p>
        </div>
        <button
          onClick={() => { setStarted(true); setRunning(true) }}
          className="rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#0a0a0a', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Start Timer
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-6 rounded-lg px-5 py-4" style={{ background: '#0f0f0f', border: '1px solid var(--border)' }}>
      <span className="font-mono text-3xl sm:text-5xl font-light tabular-nums" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
          style={running
            ? { border: '1px solid var(--border)', color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }
            : { background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }
          }
        >
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={reset}
          className="rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Reset
        </button>
      </div>
    </div>
  )
})

export default Timer
