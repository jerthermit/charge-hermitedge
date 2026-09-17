import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import SocialAuthButtons from "../components/auth/SocialAuthButtons";
import { useAuth } from "../contexts/AuthContext";
import { authService } from "../services/authService";
import type { DemoPersona } from "../services/authService";

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const LAST_EMAIL_KEY = "charge:last-email";

const accounts = [
  {
    id: "driver" as const,
    name: "Sam Rivera",
    detail: "EV driver · BYD Atto 3",
  },
  {
    id: "owner" as const,
    name: "Nina Lim",
    detail: "Charging network owner",
  },
];

const getSavedEmail = (): string => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_EMAIL_KEY) ?? "";
};

const Login = () => {
  const location = useLocation();
  const { login, loginDemo, isLoading } = useAuth();
  const registrationComplete = Boolean(
    (
      location.state as {
        registrationComplete?: boolean;
      } | null
    )?.registrationComplete,
  );

  const [panel, setPanel] = useState<"preview" | "account">(
    registrationComplete ? "account" : "preview",
  );
  const [email, setEmail] = useState(getSavedEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [demoAvailable, setDemoAvailable] = useState<boolean | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<DemoPersona[]>([]);
  const [demoIntent, setDemoIntent] = useState<DemoPersona | null>(null);
  const [socialNotice, setSocialNotice] = useState("");

  useEffect(() => {
    document.title = "Charge | Sign in";

    let active = true;

    authService
      .getDemoCapabilities()
      .then(({ enabled, personas }) => {
        if (!active) return;
        const available = enabled && personas.length > 0;
        setAvailablePersonas(personas);
        setDemoAvailable(available);
        if (!available) setPanel("account");
      })
      .catch(() => {
        if (!active) return;
        setDemoAvailable(false);
        setPanel("account");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDemoIntent(null);
    setError("");

    const normalizedEmail = email.trim();

    try {
      await login(normalizedEmail, password);
      window.localStorage.setItem(LAST_EMAIL_KEY, normalizedEmail);
    } catch {
      setError("Email or password is incorrect.");
    }
  };

  const handlePreview = async (persona: DemoPersona) => {
    setDemoIntent(persona);
    setError("");

    try {
      await loginDemo(persona);
    } catch {
      setError("Quick access is unavailable.");
      setDemoIntent(null);
    }
  };

  const showPreview = panel === "preview" && demoAvailable === true;

  return (
    <main className="min-h-screen min-h-[100svh] overflow-x-hidden bg-[#f1f2ed] text-[#111510]">
      <div className="grid min-h-screen min-h-[100svh] lg:grid-cols-[minmax(22rem,0.86fr)_minmax(32rem,1.14fr)]">
        <motion.aside
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative hidden overflow-hidden bg-[#dfff69] lg:grid lg:place-items-center"
          aria-hidden="true"
        >
          <div className="grid place-items-center gap-5 text-center">
            <motion.img
              src="/app-logo.png"
              alt=""
              initial={{ scale: 0.92, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={spring}
              className="w-[min(62%,28rem)] object-contain"
            />
            <div>
              <div className="text-4xl font-semibold tracking-[-0.06em]">
                Charge
              </div>
              <div className="mt-2 text-sm font-semibold text-black/55">
                EV charging network
              </div>
            </div>
          </div>
        </motion.aside>

        <section className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-12 xl:px-20">
          <header className="flex h-12 items-center justify-between">
            <Link
              to="/login"
              className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-black lg:hidden"
              aria-label="Charge sign in"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#dfff69] p-2">
                <img
                  src="/icons/charge-mark.png"
                  alt=""
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-none tracking-[-0.035em]">
                  Charge
                </span>
                <span className="mt-1 block text-[10px] font-semibold leading-none text-black/45">
                  EV charging network
                </span>
              </span>
            </Link>

            <span className="hidden lg:block" />

            <Link
              to="/register"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-black/50 outline-none transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:ring-2 focus-visible:ring-black"
            >
              Create account
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center py-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              className="w-full max-w-[27rem]"
            >
              <h1 className="text-[clamp(3rem,12vw,5rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
                Sign in
              </h1>

              <div className="mt-8">
                <SocialAuthButtons
                  action="Sign in"
                  onUnavailable={(provider) =>
                    setSocialNotice(
                      `${provider} sign-in is unavailable in this preview.`,
                    )
                  }
                />
                <AnimatePresence initial={false}>
                  {socialNotice && (
                    <motion.p
                      role="status"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-3 text-center text-xs font-medium text-black/45"
                    >
                      {socialNotice}
                    </motion.p>
                  )}
                </AnimatePresence>
                <div className="mt-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/30">
                  <span className="h-px flex-1 bg-black/10" />
                  or
                  <span className="h-px flex-1 bg-black/10" />
                </div>
              </div>

              {demoAvailable && (
                <div className="mt-4 grid grid-cols-2 rounded-2xl bg-black/[0.055] p-1">
                  {(["preview", "account"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPanel(item);
                        setError("");
                      }}
                      className="relative h-10 rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-black"
                    >
                      {panel === item && (
                        <motion.span
                          layoutId="login-panel"
                          transition={spring}
                          className="absolute inset-0 rounded-xl bg-white shadow-sm"
                        />
                      )}
                      <span
                        className={`relative z-10 ${
                          panel === item ? "text-black" : "text-black/45"
                        }`}
                      >
                        {item === "preview" ? "Quick access" : "Email"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {demoAvailable === null && panel === "preview" ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 grid gap-2"
                    aria-label="Loading sign-in options"
                  >
                    <div className="h-[4.5rem] rounded-2xl bg-black/[0.06]" />
                    <div className="h-[4.5rem] rounded-2xl bg-black/[0.04]" />
                  </motion.div>
                ) : showPreview ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.16 }}
                    className="mt-5 grid gap-2"
                  >
                    {accounts
                      .filter(({ id }) => availablePersonas.includes(id))
                      .map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => void handlePreview(account.id)}
                          disabled={isLoading}
                          className="group flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 text-left outline-none transition-[border-color,transform] hover:-translate-y-0.5 hover:border-black/25 focus-visible:ring-2 focus-visible:ring-black disabled:cursor-wait disabled:opacity-60"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#111510] text-sm font-semibold text-white">
                            {account.name
                              .split(" ")
                              .map((part) => part[0])
                              .join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {account.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-black/45">
                              {account.detail}
                            </span>
                          </span>
                          <span className="text-lg text-black/35 transition-transform group-hover:translate-x-0.5">
                            {isLoading && demoIntent === account.id ? "…" : "→"}
                          </span>
                        </button>
                      ))}
                  </motion.div>
                ) : (
                  <motion.form
                    key="account"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.16 }}
                    className="mt-6"
                  >
                    <div className="grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">Email</span>
                        <input
                          required
                          type="email"
                          autoComplete="email"
                          spellCheck={false}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-4 outline-none transition-[border-color,box-shadow] focus:border-black focus:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold">Password</span>
                        <span className="grid h-12 min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center overflow-hidden rounded-2xl border border-black/10 bg-white pr-2 focus-within:border-black focus-within:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]">
                          <input
                            required
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="h-full min-w-0 w-full border-0 bg-transparent px-4 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-black/35 outline-none hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </span>
                      </label>
                    </div>

                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.985 }}
                      transition={spring}
                      disabled={isLoading}
                      className="mt-5 flex h-[3.25rem] w-full items-center justify-center rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white outline-none hover:bg-[#20261f] disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    >
                      {isLoading && demoIntent === null ? "Signing in…" : "Sign in"}
                    </motion.button>
                  </motion.form>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(error || registrationComplete) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                      error
                        ? "bg-[#ffe2dd] text-[#8d2e22]"
                        : "bg-[#dfff69] text-[#111510]"
                    }`}
                    role={error ? "alert" : "status"}
                  >
                    {error || "Account created."}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <footer className="min-h-10 py-2 text-center text-xs text-black/35 lg:text-right">
            © {new Date().getFullYear()} Emman Ermitaño. All rights reserved.
          </footer>
        </section>
      </div>
    </main>
  );
};

export default Login;
