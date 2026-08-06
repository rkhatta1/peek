import type { CSSProperties, HTMLAttributes } from 'react'

const MAX_STAGGER_ORDER = 5

type ViewTransitionStyle = CSSProperties & {
  '--peek-transition-order': number
  viewTransitionClass: string
}

export function pageTransitionItem(name: string, order: number) {
  const staggerOrder = Math.min(Math.max(order, 0), MAX_STAGGER_ORDER)
  const style: ViewTransitionStyle = {
    '--peek-transition-order': staggerOrder,
    viewTransitionClass: `peek-transition-item peek-transition-order-${staggerOrder}`,
    viewTransitionName: `peek-${name}`,
  }

  return {
    'data-page-transition-item': true,
    style,
  } satisfies Pick<HTMLAttributes<HTMLElement>, 'style'> & {
    'data-page-transition-item': true
  }
}
