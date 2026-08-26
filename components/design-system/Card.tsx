import { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
}

export function Card({ strong, className, ...props }: CardProps) {
  return (
    <div
      className={cx('rounded-2xl', strong ? 'glass-strong' : 'glass', className)}
      {...props}
    />
  )
}
