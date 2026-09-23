/**
 * Shared UI primitives.
 *
 * The project intentionally avoids pulling in a component library: the whole
 * app needs a handful of controls, and hand-writing them keeps the Tailwind
 * theme tokens as the single source of styling truth.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

import { cx } from '@/utils/cx'

/* -------------------------------------------------------------------------- */
/*  Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-lab-accent text-lab-void hover:bg-lab-accent/85 disabled:bg-lab-border disabled:text-lab-faint',
  ghost: 'text-lab-muted hover:bg-lab-panel-2 hover:text-lab-text',
  outline:
    'border border-lab-border text-lab-text hover:border-lab-accent/60 hover:bg-lab-panel-2',
  danger: 'border border-lab-danger/40 text-lab-danger hover:bg-lab-danger/12',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-lab-accent/60 focus-visible:outline-none',
        'disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Icon button                                                                */
/* -------------------------------------------------------------------------- */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tone?: 'default' | 'danger'
}

export function IconButton({ label, tone = 'default', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
        'focus-visible:ring-2 focus-visible:ring-lab-accent/60 focus-visible:outline-none',
        tone === 'danger'
          ? 'text-lab-faint hover:bg-lab-danger/15 hover:text-lab-danger'
          : 'text-lab-faint hover:bg-lab-panel-2 hover:text-lab-text',
        className,
      )}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Text input                                                                 */
/* -------------------------------------------------------------------------- */

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-8 w-full rounded-md border border-lab-border bg-lab-void px-2 text-sm text-lab-text',
        'placeholder:text-lab-faint focus:border-lab-accent/70 focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('flex min-h-0 flex-col', className)}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-lab-border-soft px-3">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-lab-muted uppercase">
          {title}
        </h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tooltip-friendly hint                                                      */
/* -------------------------------------------------------------------------- */

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[11px] leading-snug text-lab-faint">{children}</p>
}

/* -------------------------------------------------------------------------- */
/*  Badge                                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border border-lab-border-soft px-1.5 py-0.5',
        'font-mono text-[10px] text-lab-muted',
        className,
      )}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full ring-1 ring-white/15"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </span>
  )
}
