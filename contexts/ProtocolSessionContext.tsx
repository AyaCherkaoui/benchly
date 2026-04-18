'use client'

import { createContext, useContext, useRef, useState, ReactNode } from 'react'
import { Protocol, Step } from '@/types'

export interface SessionCallbacks {
  onNextStep(): void
  onMarkComplete(): void
  onStartTimer(): void
  onPauseTimer(): void
}

export interface ProtocolSessionState {
  protocol: Protocol | null
  steps: Step[]
  currentStepIndex: number
}

interface ProtocolSessionContextValue {
  /** Reactive data — HandsFreeMode re-renders when this changes */
  sessionState: ProtocolSessionState
  /** Stable ref — always current callbacks, no stale closures */
  callbacksRef: React.MutableRefObject<SessionCallbacks | null>
  /** Listener functions to call when the timer completes */
  timerCompleteListenersRef: React.MutableRefObject<(() => void)[]>
  /** Called by the protocol page on mount / state changes */
  setSessionState(s: ProtocolSessionState): void
  setCallbacks(cb: SessionCallbacks): void
  clearSession(): void
  /** Called by the protocol page when its Timer fires onComplete */
  notifyTimerComplete(): void
}

const Context = createContext<ProtocolSessionContextValue | null>(null)

export function ProtocolSessionProvider({ children }: { children: ReactNode }) {
  const [sessionState, setSessionStateInternal] = useState<ProtocolSessionState>({
    protocol: null,
    steps: [],
    currentStepIndex: 0,
  })

  const callbacksRef = useRef<SessionCallbacks | null>(null)
  const timerCompleteListenersRef = useRef<(() => void)[]>([])

  function setSessionState(s: ProtocolSessionState) {
    setSessionStateInternal(s)
  }

  function setCallbacks(cb: SessionCallbacks) {
    callbacksRef.current = cb
  }

  function clearSession() {
    callbacksRef.current = null
    setSessionStateInternal({ protocol: null, steps: [], currentStepIndex: 0 })
  }

  function notifyTimerComplete() {
    timerCompleteListenersRef.current.forEach((fn) => fn())
  }

  return (
    <Context.Provider
      value={{
        sessionState,
        callbacksRef,
        timerCompleteListenersRef,
        setSessionState,
        setCallbacks,
        clearSession,
        notifyTimerComplete,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useProtocolSession() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useProtocolSession must be inside ProtocolSessionProvider')

  const { sessionState, callbacksRef } = ctx
  const currentStep = sessionState.steps[sessionState.currentStepIndex]

  return {
    ...ctx,
    currentStepTitle: currentStep?.title ?? '',
    protocolName: sessionState.protocol?.name ?? '',
    protocolId: sessionState.protocol?.id ?? '',
    onNextStep: () => callbacksRef.current?.onNextStep(),
    onMarkComplete: () => callbacksRef.current?.onMarkComplete(),
    onStartTimer: () => callbacksRef.current?.onStartTimer(),
    onPauseTimer: () => callbacksRef.current?.onPauseTimer(),
  }
}
