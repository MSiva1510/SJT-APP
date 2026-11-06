export default function Badge({ status }) {
  const map = {
    done:        'badge badge-done',
    pending:     'badge badge-pending',
    active:      'badge badge-active',
    'on-leave':  'badge badge-pending',
    maintenance: 'badge badge-maintenance',
  }
  const labels = {
    done: '✓ Done', pending: '⏳ Pending',
    active: '● Active', 'on-leave': '○ On Leave',
    maintenance: '⚠ Service',
  }
  return (
    <span className={map[status] || 'badge badge-active'}>
      {labels[status] || status}
    </span>
  )
}
