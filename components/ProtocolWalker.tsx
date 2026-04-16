'use client'

import { Step } from '@/types'

interface ProtocolWalkerProps {
  steps: Step[]
  currentStep: number
  onStepComplete: (stepNumber: number) => void
}

export default function ProtocolWalker({ steps, currentStep, onStepComplete }: ProtocolWalkerProps) {
  const step = steps.find((s) => s.step_number === currentStep)

  if (!step) return <p>No step found.</p>

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold">
        Step {step.step_number}: {step.title}
      </h2>
      <p className="mt-2 text-gray-700">{step.instructions}</p>
      {step.warning && (
        <p className="mt-2 rounded bg-yellow-100 p-2 text-yellow-800">⚠️ {step.warning}</p>
      )}
      <button
        onClick={() => onStepComplete(step.step_number)}
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Mark Complete
      </button>
    </div>
  )
}
