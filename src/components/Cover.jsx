import { useEffect, useState } from 'react';
import { artUrl } from '../lib/api';
import { BrandGlyph } from './BrandMark';

export function Cover({ art, title = '', size = 48, radius = 12, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [art]);
  const url = art ? artUrl(art) : null;
  const style = { width: size, height: size, borderRadius: radius };
  return (
    <div className={`cover ${className}`} style={style}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="cover-fallback" aria-hidden="true">
          <BrandGlyph />
        </div>
      )}
    </div>
  );
}

export function PlaylistCover({ playlist, songs = [], size = 180, radius = 18, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [playlist?.coverArt, playlist?.coverUrl]);
  const style = { width: size, height: size, borderRadius: radius };

  if (playlist?.coverArt) {
    return <Cover art={playlist.coverArt} title={playlist.name} size={size} radius={radius} className={className} />;
  }
  if (playlist?.coverUrl && !failed) {
    return (
      <div className={`playlist-cover ${className}`} style={style}>
        <img src={playlist.coverUrl} alt="" draggable={false} onError={() => setFailed(true)} />
      </div>
    );
  }

  const arts = songs
    .map((song) => song?.art)
    .filter(Boolean)
    .filter((art, i, arr) => arr.indexOf(art) === i)
    .slice(0, 4);

  if (arts.length >= 4) {
    return (
      <div className={`playlist-cover mosaic ${className}`} style={style}>
        {arts.map((art, i) => (
          <img key={`${art}-${i}`} src={artUrl(art)} alt="" draggable={false} loading="lazy" />
        ))}
      </div>
    );
  }
  if (arts.length > 0) {
    return (
      <div className={`playlist-cover ${className}`} style={style}>
        <img src={artUrl(arts[0])} alt="" draggable={false} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`playlist-cover empty ${className}`} style={style}>
      <BrandGlyph />
    </div>
  );
}
