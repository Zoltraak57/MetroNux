import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export function IconButton({
  children,
  label,
  onClick,
  active = false,
  className = '',
  size = 'md',
  disabled = false,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${size} ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 22 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Memuat" />;
}

export function SectionHeader({ title, subtitle, action, actionLabel = 'Lihat semua' }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button type="button" className="text-btn" onClick={action}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      {Icon && (
        <div className="empty-icon">
          <Icon size={compact ? 26 : 34} />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function Segmented({ options, value, onChange, compact = false }) {
  return (
    <div className={`segmented ${compact ? 'compact' : ''}`} role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', headerExtra }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="modal-head-actions">
            {headerExtra}
            <IconButton label="Tutup" onClick={onClose} size="sm">
              <X size={18} />
            </IconButton>
          </div>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

export function ProgressBar({ value = 0, max = 100, className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress-track ${className}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({ active, children, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'active' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
