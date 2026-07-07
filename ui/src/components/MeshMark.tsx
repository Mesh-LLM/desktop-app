/** The Mesh brand mark: a diamond node with orbiting link points — replaces
 *  the old `&#9671;` text glyph everywhere. Pure SVG so it inherits
 *  currentColor and scales crisply at any size. */
export default function MeshMark({
  size = 20,
  className = '',
  pulse = false,
}: {
  size?: number
  className?: string
  pulse?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        d="M12 3 L21 12 L12 21 L3 12 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.2" fill="currentColor">
        {pulse && (
          <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      <circle cx="12" cy="3" r="1.4" fill="currentColor" />
      <circle cx="21" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="21" r="1.4" fill="currentColor" />
      <circle cx="3" cy="12" r="1.4" fill="currentColor" />
    </svg>
  )
}
