const M_PATH = 'M118 122H394V390H118Z M178 122V390H238Z M334 122V390H274Z';

export function BrandGlyph({ className = '' }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={M_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg
      viewBox="0 0 512 512"
      className="brand-mark"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="512" height="512" rx="116" fill="#17151a" />
      <path d={M_PATH} fill="#f3f0e9" fillRule="evenodd" />
    </svg>
  );
}
