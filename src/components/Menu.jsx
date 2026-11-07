import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Menu({ x, y, items, onClose, width = 228 }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const height = ref.current?.offsetHeight || items.length * 42 + 16;
    const nextX = Math.max(8, Math.min(x, window.innerWidth - width - 10));
    const nextY =
      y + height > window.innerHeight - 12
        ? Math.max(10, y - height - 8)
        : y;
    setPosition({ x: nextX, y: nextY });
  }, [x, y, items.length, width]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="menu-backdrop" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="menu" ref={ref} style={{ left: position.x, top: position.y, width }} role="menu">
        {items.map((item, index) =>
          item.separator ? (
            <div className="menu-separator" key={`sep-${index}`} />
          ) : (
            <button
              key={item.label || index}
              type="button"
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick?.();
              }}
            >
              {item.icon && <item.icon size={17} />}
              <span>{item.label}</span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          )
        )}
      </div>
    </>,
    document.body
  );
}

export function MoreMenuButton({ items, label = 'Opsi lain', size = 18, className = '' }) {
  const buttonRef = useRef(null);
  const [pos, setPos] = useState(null);

  const open = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({ x: rect.right - 228, y: rect.bottom + 4 });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-btn icon-btn-sm ${className}`}
        aria-label={label}
        title={label}
        onClick={open}
        onContextMenu={(e) => {
          e.preventDefault();
          open(e);
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {pos && <Menu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} />}
    </>
  );
}
