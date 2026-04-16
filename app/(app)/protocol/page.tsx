import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Protocol } from '@/types'
import { ArrowRight, FlaskConical } from 'lucide-react'

export default async function ProtocolsPage() {
  const { data: protocols } = await supabase
    .from('protocols')
    .select('*')
    .order('created_at')

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Protocols</h1>
        <p className="mt-1 text-slate-400">Select a protocol to begin your lab session</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {((protocols as Protocol[]) ?? []).map((protocol) => (
          <Link
            key={protocol.id}
            href={`/protocol/${protocol.id}`}
            className="group flex flex-col gap-4 rounded-2xl bg-[#152235] p-6 ring-1 ring-slate-700/50 transition hover:ring-teal-500/50"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-teal-500/10 p-2">
                <FlaskConical size={20} className="text-teal-400" />
              </div>
              <ArrowRight
                size={18}
                className="text-slate-600 transition group-hover:text-teal-400"
              />
            </div>
            <div>
              <h2 className="font-semibold text-white">{protocol.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{protocol.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
