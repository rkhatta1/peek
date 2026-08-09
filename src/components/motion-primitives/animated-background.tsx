'use client'

import { AnimatePresence, motion, type Transition } from 'motion/react'
import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useState,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '#/lib/utils'

type AnimatedBackgroundChildProps = {
  'data-id': string
  'data-checked'?: string
  className?: string
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLElement>
  onMouseEnter?: MouseEventHandler<HTMLElement>
  onMouseLeave?: MouseEventHandler<HTMLElement>
}

type AnimatedBackgroundChild = ReactElement<AnimatedBackgroundChildProps>

export type AnimatedBackgroundProps = {
  children: AnimatedBackgroundChild[] | AnimatedBackgroundChild
  defaultValue?: string
  onValueChange?: (newActiveId: string | null) => void
  className?: string
  transition?: Transition
  enableHover?: boolean
}

export function AnimatedBackground({
  children,
  defaultValue,
  onValueChange,
  className,
  transition,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(defaultValue ?? null)
  const uniqueId = useId()

  function handleSetActiveId(id: string | null) {
    setActiveId(id)
    onValueChange?.(id)
  }

  useEffect(() => {
    if (defaultValue !== undefined) setActiveId(defaultValue)
  }, [defaultValue])

  return Children.map(children, (child) => {
    const id = child.props['data-id']
    const interactionProps = enableHover
      ? {
          onMouseEnter: () => handleSetActiveId(id),
          onMouseLeave: () => handleSetActiveId(null),
        }
      : { onClick: () => handleSetActiveId(id) }

    return cloneElement(
      child,
      {
        key: id,
        className: cn('relative inline-flex', child.props.className),
        'data-checked': activeId === id ? 'true' : 'false',
        ...interactionProps,
      },
      <>
        <AnimatePresence initial={false}>
          {activeId === id ? (
            <motion.div
              animate={{ opacity: 1 }}
              className={cn('pointer-events-none absolute inset-0', className)}
              exit={{ opacity: 0 }}
              initial={{ opacity: defaultValue ? 1 : 0 }}
              layoutId={`background-${uniqueId}`}
              transition={transition}
            />
          ) : null}
        </AnimatePresence>
        <div className="relative z-10">{child.props.children}</div>
      </>,
    )
  })
}
