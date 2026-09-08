import { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
}

/** Radio maximo 6px y separacion por linea de 1px: ver .glass en globals.css,
 *  que dejo de ser vidrio esmerilado con el rediseno editorial. */
export function Card({ strong, className, ...props }: CardProps) {
  return (
    <div
      className={cx('rounded-[6px]', strong ? 'glass-strong' : 'glass', className)}
      {...props}
    />
  )
}
