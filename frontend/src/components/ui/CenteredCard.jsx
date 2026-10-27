import Wordmark from './Wordmark.jsx'

// Layout for the full-screen steps before the vault is open (sign in, setup, unlock).
export default function CenteredCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Wordmark className="mb-8 text-2xl" />
      <section className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-sm sm:p-8">
        {Icon && (
          <div className="mb-4 grid size-11 place-items-center rounded-ctl bg-accent/10 text-accent">
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </div>
  )
}
