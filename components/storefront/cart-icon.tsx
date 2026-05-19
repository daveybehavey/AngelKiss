type CartIconProps = {
  className?: string;
};

/** Shopping bag icon for header cart (decorative; link has aria-label). */
export function CartIcon({ className }: CartIconProps) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 7.5V6a4 4 0 1 1 8 0v1.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M5.5 7.5h13l-1.05 10.6c-.08.95-.88 1.7-1.85 1.7H8.4c-.97 0-1.77-.75-1.85-1.7L5.5 7.5Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
    </svg>
  );
}
