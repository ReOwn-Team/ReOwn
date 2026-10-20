// Monogram ReOwn: chân chữ R kéo dài thành vòng mũi tên — đồ dùng quay vòng sang chủ mới.
export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg className={`logo-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M25 43V21h7.5a6 6 0 0 1 0 12H25M31.5 33L42.09 50.98A21.5 21.5 0 1 1 53.17 28.27" />
        <path d="M58.03 27.41L54.18 33.98L48.32 29.12" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 32 }) {
  return <><LogoMark size={size} /><span className="logo-word">Re<span>Own</span></span></>;
}
