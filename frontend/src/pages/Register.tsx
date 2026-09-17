import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import SocialAuthButtons from "../components/auth/SocialAuthButtons";
import { useAuth } from "../contexts/AuthContext";

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};

const Register = () => {
  const { register, isLoading } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [socialNotice, setSocialNotice] = useState("");

  useEffect(() => {
    document.title = "Charge | Create account";
  }, []);

  const updateField =
    (field: keyof typeof form) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
      if (error) setError("");
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!form.fullName.trim()) {
      setError("Enter your name.");
      return;
    }

    if (form.password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await register({
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } catch {
      setError("Account could not be created.");
    }
  };

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
              initial={{ scale: 0.92, rotate: 4 }}
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
              to="/login"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-black/50 outline-none transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:ring-2 focus-visible:ring-black"
            >
              Sign in
            </Link>
          </header>

          <div className="flex flex-1 items-center justify-center py-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              className="w-full max-w-[29rem]"
            >
              <h1 className="text-[clamp(3rem,12vw,5rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
                Create account
              </h1>

              <div className="mt-8">
                <SocialAuthButtons
                  action="Sign up"
                  onUnavailable={(provider) =>
                    setSocialNotice(
                      `${provider} sign-up is unavailable in this preview.`,
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

              <form onSubmit={handleSubmit} className="mt-4">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0, y: -6 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5 rounded-2xl bg-[#ffe2dd] px-4 py-3 text-sm text-[#8d2e22]"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-2 sm:col-span-2">
                    <span className="text-xs font-semibold">Name</span>
                    <input
                      required
                      maxLength={120}
                      autoComplete="name"
                      value={form.fullName}
                      onChange={updateField("fullName")}
                      className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none transition-[border-color,box-shadow] focus:border-black focus:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]"
                    />
                  </label>

                  <label className="grid min-w-0 gap-2 sm:col-span-2">
                    <span className="text-xs font-semibold">Email</span>
                    <input
                      required
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      spellCheck={false}
                      value={form.email}
                      onChange={updateField("email")}
                      className="h-12 min-w-0 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none transition-[border-color,box-shadow] focus:border-black focus:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]"
                    />
                  </label>

                  <label className="grid min-w-0 gap-2">
                    <span className="text-xs font-semibold">Password</span>
                    <span className="grid h-12 min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center overflow-hidden rounded-2xl border border-black/10 bg-white pr-2 focus-within:border-black focus-within:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]">
                      <input
                        required
                        minLength={8}
                        maxLength={100}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={updateField("password")}
                        className="h-full min-w-0 w-full border-0 bg-transparent px-4 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="grid h-9 w-9 place-items-center rounded-xl text-black/35 outline-none hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                        aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </span>
                  </label>

                  <label className="grid min-w-0 gap-2">
                    <span className="text-xs font-semibold">Confirm</span>
                    <span className="grid h-12 min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center overflow-hidden rounded-2xl border border-black/10 bg-white pr-2 focus-within:border-black focus-within:shadow-[0_0_0_3px_rgba(17,21,16,0.07)]">
                      <input
                        required
                        minLength={8}
                        maxLength={100}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={updateField("confirmPassword")}
                        className="h-full min-w-0 w-full border-0 bg-transparent px-4 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="grid h-9 w-9 place-items-center rounded-xl text-black/35 outline-none hover:bg-black/5 hover:text-black focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                        aria-label={showPassword ? "Hide passwords" : "Show passwords"}
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
                  className="mt-6 flex h-[3.25rem] w-full items-center justify-center rounded-2xl bg-[#111510] px-5 text-sm font-semibold text-white outline-none hover:bg-[#20261f] disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  {isLoading ? "Creating account…" : "Create account"}
                </motion.button>
              </form>
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

export default Register;
