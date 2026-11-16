// Écran de chargement des pages : squelette de la mise en page, pour montrer que l'app travaille.
export default function Loading() {
  const block = "animate-pulse rounded-md bg-surface-3/70";
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="mb-6 border-b border-line pb-5">
        <div className={`${block} mb-2 h-3 w-32`} />
        <div className={`${block} h-8 w-64`} />
        <div className={`${block} mt-2 h-4 w-96 max-w-full`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-md border border-line bg-surface p-4">
            <div className={`${block} h-3 w-24`} />
            <div className={`${block} mt-3 h-7 w-16`} />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-line bg-surface">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className={`${block} size-9 shrink-0`} />
            <div className="flex-1">
              <div className={`${block} h-3.5 w-1/3`} />
              <div className={`${block} mt-2 h-3 w-1/5`} />
            </div>
            <div className={`${block} h-3.5 w-14`} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">Chargement…</p>
    </div>
  );
}
