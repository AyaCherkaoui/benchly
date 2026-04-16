'use client'

import { Sample } from '@/types'

interface SampleTrackerProps {
  samples: Sample[]
  onAddSample?: () => void
}

export default function SampleTracker({ samples, onAddSample }: SampleTrackerProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Sample Tracker</h2>
        {onAddSample && (
          <button
            onClick={onAddSample}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
          >
            + Add Sample
          </button>
        )}
      </div>
      {samples.length === 0 ? (
        <p className="text-sm text-gray-500">No samples tracked yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-1">Sample ID</th>
              <th className="pb-1">Tube</th>
              <th className="pb-1">Location</th>
              <th className="pb-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-1">{s.sample_id_label}</td>
                <td className="py-1">{s.tube_label}</td>
                <td className="py-1">{s.location}</td>
                <td className="py-1 text-gray-500">{s.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
