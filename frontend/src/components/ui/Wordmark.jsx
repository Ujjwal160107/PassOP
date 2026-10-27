export default function Wordmark({ className = '' }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      <span className="text-muted">&lt;</span>PassOP<span className="text-muted">/&gt;</span>
    </span>
  )
}
