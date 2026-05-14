/** Same spinner pattern used by ImpactAnalysis for household calculations,
 *  so the statewide tabs visually match while their /us/economy polls
 *  are in flight. Use `size="sm"` for inline status badges, `size="lg"`
 *  for full-card placeholders. */
interface Props {
  label?: React.ReactNode;
  size?: 'sm' | 'lg';
}

export default function Spinner({ label, size = 'lg' }: Props) {
  const dim =
    size === 'sm'
      ? 'h-4 w-4 border-2'
      : 'h-12 w-12 border-4';

  if (size === 'sm') {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className={`inline-block ${dim} animate-spin rounded-full border-solid border-primary border-r-transparent align-middle`}
          aria-hidden="true"
        />
        {label && <span>{label}</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div
          className={`inline-block ${dim} animate-spin rounded-full border-solid border-primary border-r-transparent`}
          aria-hidden="true"
        />
        {label && <p className="mt-4 text-gray-600">{label}</p>}
      </div>
    </div>
  );
}
