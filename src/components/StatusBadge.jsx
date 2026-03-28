const STATUS_CONFIG = {
  pending: { label: 'Pendiente', className: 'badge-pending' },
  accepted: { label: 'Aceptado', className: 'badge-accepted' },
  in_progress: { label: 'En curso', className: 'badge-progress' },
  completed: { label: 'Completado', className: 'badge-completed' },
  cancelled: { label: 'Cancelado', className: 'badge-cancelled' },
}

export function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, className: '' }
  return <span className={`badge ${config.className}`}>{config.label}</span>
}
