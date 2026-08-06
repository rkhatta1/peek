import { cn } from '#/lib/utils'

export function PeekMark({ className }: { className?: string }) {
  return (
    <span
      aria-label="Peek"
      className={cn(
        'grid size-8 place-items-center text-[11px] font-semibold tracking-[-0.08em]',
        className,
      )}
    >
      <span aria-hidden="true">
        [<span className="text-[#557a46]">•</span>]
      </span>
    </span>
  )
}
