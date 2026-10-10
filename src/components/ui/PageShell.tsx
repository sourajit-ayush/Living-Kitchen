/**
 * Layout for the pantry, book, list and sign-in pages: the 3D kitchen stays in view (left on
 * desktop, the top of the screen on phones) and the page is a glass panel beside / below it.
 */
export function PageShell({
  title,
  lede,
  actions,
  children,
  wide = false,
}: {
  title: string;
  lede?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative min-h-dvh pt-[calc(45dvh-1.5rem)] outline-none lg:pt-0"
    >
      <div
        className={`flex min-h-[calc(55dvh+1.5rem)] flex-col gap-6 rounded-t-sheet px-5 pt-6 pb-16 glass lg:fixed lg:top-20 lg:right-6 lg:bottom-6 lg:min-h-0 lg:overflow-y-auto lg:rounded-sheet lg:p-8 ${
          wide ? "lg:w-[min(720px,56vw)]" : "lg:w-[min(560px,44vw)]"
        }`}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-h1 text-ink">{title}</h1>
            {lede && <p className="mt-1 max-w-[52ch] text-ink-muted">{lede}</p>}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </main>
  );
}
