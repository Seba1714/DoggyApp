export function LoadingSkeleton({ lines = 3, card = false }) {
  const content = (
    <div className="skeleton-container">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )

  if (card) {
    return <div className="card">{content}</div>
  }
  return content
}

export function LoadingCards({ count = 3 }) {
  return (
    <div className="skeleton-cards">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeleton key={i} lines={3} card />
      ))}
    </div>
  )
}
