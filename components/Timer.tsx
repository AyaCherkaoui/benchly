'use client'

import { useEffect, useState } from 'react'

interface TimerProps {
  seconds: number
  onComplete?: () => void
}

export default function Timer({ seconds, onComplete }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    if (timeLeft <= 0) {
      onComplete?.()
      setRunning(false)
      return
    }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [running, timeLeft, onComplete])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <div className="flex items-center gap-4">
      <span className="text-2xl font-mono">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <button
        onClick={() => setRunning((r) => !r)}
        className="rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700"
      >
        {running ? 'Pause' : 'Start'}
      </button>
      <button
        onClick={() => { setTimeLeft(seconds); setRunning(false) }}
        className="rounded bg-gray-300 px-3 py-1 hover:bg-gray-400"
      >
        Reset
      </button>
    </div>
  )
}
