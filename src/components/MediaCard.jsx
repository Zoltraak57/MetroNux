import { Play } from 'lucide-react';
import { Cover } from './Cover';

export function MediaCard({
  title,
  subtitle,
  art,
  cover,
  onClick,
  onPlay,
  round = false,
  badge = null,
  className = '',
  playLabel,
  openLabel,
}) {
  return (
    <div className={`media-card ${className}`}>
      <div className="media-card-cover">
        {cover || (
          <Cover
            art={art}
            title={title}
            size="100%"
            radius={round ? '50%' : 12}
          />
        )}
        {badge}
        {onPlay && (
          <button
            type="button"
            className="media-card-play"
            aria-label={playLabel || `Putar ${title}`}
            onClick={onPlay}
          >
            <Play size={20} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="media-card-text">
        <span className="media-card-title" title={title}>
          {title}
        </span>
        {subtitle && (
          <span className="media-card-subtitle" title={typeof subtitle === 'string' ? subtitle : undefined}>
            {subtitle}
          </span>
        )}
      </div>
      {onClick && (
        <button
          type="button"
          className="media-card-open"
          aria-label={openLabel || `Buka ${title}`}
          onClick={onClick}
        />
      )}
    </div>
  );
}
