export function Logo({ size = 32 }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="logo-icon"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
      </defs>
      {/* Background */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="var(--surface-solid, #16161f)"/>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#logoGrad)" fillOpacity="0.12"/>
      {/* Cloud */}
      <path 
        d="M44 40H24c-3.9 0-7-3.1-7-7 0-3.4 2.4-6.2 5.6-6.8C23.4 22.4 26.8 20 31 20c4.5 0 8.3 3.2 9.2 7.4 0.3 0 0.5-0.1 0.8-0.1 3.1 0 5.7 2.5 5.7 5.7 0 0.4-0.1 0.9-0.2 1.3C48.5 35.2 50 37.4 50 40c0 3.3-2.7 6-6 6" 
        stroke="url(#logoGrad)" 
        strokeWidth="2.5" 
        fill="none" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* Upload arrow */}
      <path 
        d="M32 48V38M32 38l-4 4M32 38l4 4" 
        stroke="url(#logoGrad)" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWithText({ size = 32 }) {
  return (
    <div className="logo-with-text">
      <Logo size={size} />
      <span className="logo-text">CloudVault</span>
    </div>
  );
}
