export default function Wordmark({ className = '' }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      <span className="text-accent">&lt;</span>Pass<span className="text-accent">OP/&gt;</span>
    </span>
  )
}
