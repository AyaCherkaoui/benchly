export default function ProtocolPage({ params }: { params: { id: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Protocol {params.id}</h1>
    </main>
  )
}
