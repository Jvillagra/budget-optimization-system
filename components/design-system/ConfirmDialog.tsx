'use client'

import { useEffect } from 'react'
import { Button } from './Button'

export interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal de confirmación con el lenguaje visual del sistema (reemplaza
 * `window.confirm` nativo). Usado en acciones irreversibles o de gobernanza:
 * eliminar foto de comprobante, quitar un admin.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 motion-safe:animate-[fadeIn_150ms_ease-out]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="relative max-w-sm w-full rounded-2xl overflow-hidden p-5 space-y-4 motion-safe:animate-[scaleIn_180ms_ease-out]"
        style={{ background: '#f7f3ed', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="space-y-1.5">
          <p id="confirm-dialog-title" className="font-bold text-base" style={{ color: '#1c1c1c' }}>
            {title}
          </p>
          <p id="confirm-dialog-description" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Un momento…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
