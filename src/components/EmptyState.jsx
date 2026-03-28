export function EmptyState({ icon = '🐕', title, message }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  )
}
