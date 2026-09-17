interface SocialAuthButtonsProps {
  action: "Sign in" | "Sign up";
  onUnavailable: (provider: "Google" | "Apple") => void;
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      fill="#4285F4"
      d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.51c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"
    />
    <path
      fill="#FBBC05"
      d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"
    />
    <path
      fill="#EA4335"
      d="M12 5.97c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"
    />
  </svg>
);

const AppleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[1.1rem] w-[1.1rem] fill-current">
    <path d="M16.7 12.9c0-2 1.6-3 1.7-3.1a3.7 3.7 0 0 0-2.9-1.6c-1.2-.1-2.4.7-3 .7-.6 0-1.5-.7-2.5-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7s1.8-1 2.5-2c.8-1.1 1.1-2.3 1.1-2.4-.1 0-2.6-1-2.6-3ZM14.7 6.9c.5-.7.9-1.6.8-2.5-.8 0-1.8.5-2.4 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.4-1.1Z" />
  </svg>
);

const SocialAuthButtons = ({
  action,
  onUnavailable,
}: SocialAuthButtonsProps) => (
  <div className="grid gap-2 sm:grid-cols-2" aria-label={`${action} options`}>
    <button
      type="button"
      onClick={() => onUnavailable("Google")}
      className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-semibold text-[#111510] outline-none transition-[border-color,transform] hover:-translate-y-0.5 hover:border-black/25 focus-visible:ring-2 focus-visible:ring-black"
    >
      <GoogleMark />
      {action} with Google
    </button>
    <button
      type="button"
      onClick={() => onUnavailable("Apple")}
      className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-semibold text-[#111510] outline-none transition-[border-color,transform] hover:-translate-y-0.5 hover:border-black/25 focus-visible:ring-2 focus-visible:ring-black"
    >
      <AppleMark />
      {action} with Apple
    </button>
  </div>
);

export default SocialAuthButtons;
