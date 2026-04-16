'use client'

import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  seconds: number
  autoStart?: boolean
  onComplete?: () => void
}

export default function Timer({ seconds, autoStart = false, onComplete }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(autoStart)
  const [done, setDone] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Reset fully when the step changes (seconds prop changes)
  useEffect(() => {
    setTimeLeft(seconds)
    setRunning(autoStart)
    setDone(false)
  }, [seconds, autoStart])

  useEffect(() => {
    if (!running) return
    if (timeLeft <= 0) {
      setRunning(false)
      setDone(true)
      playBeep()
      onCompleteRef.current?.()
      return
    }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [running, timeLeft])

  function playBeep() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.8)
    } catch {
      // AudioContext not available (SSR or permissions denied)
    }
  }

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-teal-500/10 px-5 py-4 ring-1 ring-teal-500/30">
        <span className="text-xl">✅</span>
        <span className="font-semibold text-teal-400">Timer complete!</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-5 rounded-xl bg-slate-800/50 px-5 py-4">
      <span className="font-mono text-4xl font-bold tabular-nums text-white">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
        >
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => { setTimeLeft(seconds); setRunning(false); setDone(false) }}
          className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
