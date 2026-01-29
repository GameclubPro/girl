import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

type VirtualStackProps<T> = {
  items: T[]
  estimateSize: number
  gap?: number
  overscan?: number
  className?: string
  role?: string
  getItemKey?: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactElement
}

export type VirtualStackHandle = {
  scrollToIndex: (
    index: number,
    options?: {
      align?: 'start' | 'center' | 'end' | 'auto'
      behavior?: 'auto' | 'smooth'
    }
  ) => void
}

const VirtualStackInner = <T,>(
  {
    items,
    estimateSize,
    gap = 0,
    overscan = 6,
    className,
    role,
    getItemKey,
    renderItem,
  }: VirtualStackProps<T>,
  ref: React.Ref<VirtualStackHandle>
) => {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const node = parentRef.current
    if (!node || typeof window === 'undefined') return
    const update = () => {
      const rect = node.getBoundingClientRect()
      const next = rect.top + window.scrollY
      setScrollMargin((current) => (Math.abs(current - next) > 1 ? next : current))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  })

  const totalEstimate = useMemo(() => estimateSize + gap, [estimateSize, gap])
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => totalEstimate,
    overscan,
    scrollMargin,
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) => {
        if (!Number.isInteger(index) || index < 0 || index >= items.length) return
        virtualizer.scrollToIndex(index, {
          align: options?.align ?? 'start',
          behavior: options?.behavior ?? 'smooth',
        })
      },
    }),
    [items.length, virtualizer]
  )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div
      ref={parentRef}
      className={className}
      role={role}
      style={{ position: 'relative', display: 'block' }}
    >
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={getItemKey?.(item, virtualRow.index) ?? virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                paddingBottom: gap ? `${gap}px` : undefined,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const VirtualStack = forwardRef(VirtualStackInner) as <T>(
  props: VirtualStackProps<T> & React.RefAttributes<VirtualStackHandle>
) => ReactElement | null
