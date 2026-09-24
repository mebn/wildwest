import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { sfx } from './sound'

export function Bubble({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bubble ${className}`}>{children}</section>
}

type Color = 'orange' | 'green' | 'blue' | 'pink' | 'plain'

export function Button({
  color = 'orange', big, className = '', onClick, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { color?: Color; big?: boolean }) {
  return (
    <button
      className={`btn btn-${color} ${big ? 'btn-big' : ''} ${className}`}
      onClick={e => { sfx.pop(); onClick?.(e) }}
      {...rest}
    />
  )
}

export function Chips<T extends string | number>({
  value, options, onChange, disabled,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button
          key={String(o.value)}
          className={`chip ${o.value === value ? 'chip-on' : ''}`}
          disabled={disabled}
          onClick={() => { sfx.click(); onChange(o.value) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ emoji, size = 'md' }: { emoji: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${size}`}>{emoji}</span>
}
