import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Protocol } from '@/types'
import { ArrowRight } from 'lucide-react'

export default async function ProtocolsPage() {
  const { data: protocols } = await supabase
    .from('protocols')
    .select('*')
    .order('created_at')

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>
          Protocols
        </h1>
        <p className="mt-2" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Select a protocol to begin your lab session
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {((protocols as Protocol[]) ?? []).map((protocol) => (
          <Link
            key={protocol.id}
            href={`/protocol/${protocol.id}`}
            className="group flex items-start justify-between gap-4 rounded-xl p-6 transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="min-w-0">
              <h2 className="font-serif text-xl font-normal" style={{ color: 'var(--text-primary)' }}>
                {protocol.name}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {protocol.description}
              </p>
            </div>
            <ArrowRight size={16} className="mt-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--accent)' }} />
          </Link>
        ))}
      </div>
    </div>
  )
}
