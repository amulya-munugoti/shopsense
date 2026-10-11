import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PackageSearch, Eye, EyeOff, Store, ShieldCheck, X } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/auth";

const LOGIN_HISTORY_KEY = "shopsense_login_history";

function getLoginHistory(role) {
  try {
    const history = JSON.parse(localStorage.getItem(LOGIN_HISTORY_KEY) || "{}");
    return Array.isArray(history[role]) ? history[role] : [];
  } catch {
    return [];
  }
}

function saveLoginHistory(role, rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return [];

  const history = { admin: [], vendor: [] };
  try {
    Object.assign(history, JSON.parse(localStorage.getItem(LOGIN_HISTORY_KEY) || "{}"));
  } catch {
    // A corrupted browser value is safely replaced with a new history.
  }

  history[role] = [email, ...(history[role] || []).filter((item) => item !== email)].slice(0, 10);
  localStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(history));
  return history[role];
}

function removeLoginHistory(role, emailToRemove) {
  try {
    const history = JSON.parse(localStorage.getItem(LOGIN_HISTORY_KEY) || "{}");
    const updatedHistory = {
      ...history,
      [role]: (history[role] || []).filter((email) => email !== emailToRemove),
    };
    localStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(updatedHistory));
    return updatedHistory[role];
  } catch {
    return [];
  }
}

export default function Login() {
  const [role, setRole] = useState("vendor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState(() => getLoginHistory("vendor"));
  const [showEmailHistory, setShowEmailHistory] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password, role });
      setLoginHistory(saveLoginHistory(role, email));
      login(data.token, data.user);
      navigate(role === "admin" ? "/admin/dashboard" : "/vendor/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.error ||
        (err.response
          ? "The ShopSense API could not process this login. Check that the frontend points to the correct API URL."
          : "Cannot reach the ShopSense API. Start the backend or check VITE_API_URL in the frontend deployment."),
      );
    } finally {
      setLoading(false);
    }
  };

  const changeRole = (nextRole) => {
    setRole(nextRole);
    setEmail("");
    setPassword("");
    setError("");
    setLoginHistory(getLoginHistory(nextRole));
    setShowEmailHistory(false);
  };

  const deleteSavedEmail = (savedEmail) => {
    setLoginHistory(removeLoginHistory(role, savedEmail));
  };

  const isAdmin = role === "admin";
  const matchingLoginHistory = loginHistory.filter((savedEmail) =>
    savedEmail.startsWith(email.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-[0.95fr_1.05fr]" style={{ background: "var(--surface)" }}>
      {/* Left brand panel */}
      <div
        className="hidden lg:flex flex-col justify-between p-8 xl:p-10 relative overflow-hidden"
        style={{ background: "var(--sidebar)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <PackageSearch size={20} color="#0d1e1a" />
          </div>
          <span className="font-display text-xl font-bold text-white">ShopSense</span>
        </div>

        <div className="max-w-md">
          <p className="uppercase tracking-[0.18em] text-xs mb-3" style={{ color: "var(--accent)" }}>
            {isAdmin ? "Marketplace Administration Console" : "Vendor Marketplace Console"}
          </p>
          <h1 className="font-display text-3xl xl:text-4xl font-bold text-white leading-tight mb-3">
            {isAdmin ? <>Every account.<br />One console.</> : <>Every vendor.<br />One ledger.</>}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--sidebar-soft)" }}>
            {isAdmin
              ? "Manage approvals, catalog health, and revenue across the entire marketplace."
              : "Track approvals, catalog health, and revenue across your entire vendor network from a single console."}
          </p>
        </div>

        <div className="flex gap-6 text-xs" style={{ color: "var(--sidebar-soft)" }}>
          <span>© {new Date().getFullYear()} ShopSense</span>
        </div>

        <div
          className="absolute -right-24 -bottom-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: "var(--accent)" }}
        />
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-5 py-8 sm:p-8 lg:p-12">
        <div className="w-full max-w-md rounded-2xl p-6 shadow-xl shadow-emerald-950/5 sm:p-8 lg:max-w-lg lg:p-10" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="lg:hidden flex items-center gap-2 mb-6 justify-center">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <PackageSearch size={20} color="white" />
            </div>
            <span className="font-display text-xl font-bold">ShopSense</span>
          </div>

          <h2 className="font-display text-3xl font-bold mb-2">Welcome back</h2>
          <p className="mb-7 text-base" style={{ color: "var(--ink-soft)" }}>
            Sign in to manage your {isAdmin ? "marketplace" : "storefront"}.
          </p>

          <p className="-mt-5 mb-5 text-xs" style={{ color: "var(--ink-soft)" }}>
            {isAdmin ? "Admin access is provisioned by the app owner. Local demo access can be configured in the backend environment." : "Use the email address you registered with."}
          </p>

          <div
            className="grid grid-cols-2 gap-1 rounded-xl p-1.5 mb-6"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <button
              type="button"
              onClick={() => changeRole("vendor")}
              className={`flex items-center justify-center gap-2 rounded-lg py-3 text-base font-medium transition focus-ring`}
              style={
                role === "vendor"
                  ? { background: "var(--primary)", color: "white" }
                  : { color: "var(--ink-soft)" }
              }
            >
              <Store size={15} /> Vendor
            </button>
            <button
              type="button"
              onClick={() => changeRole("admin")}
              className={`flex items-center justify-center gap-2 rounded-lg py-3 text-base font-medium transition focus-ring`}
              style={
                role === "admin"
                  ? { background: "var(--primary)", color: "white" }
                  : { color: "var(--ink-soft)" }
              }
            >
              <ShieldCheck size={15} /> Admin
            </button>
          </div>

          {error && (
            <div
              className="mb-4 text-sm px-4 py-3 rounded-lg"
              style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setShowEmailHistory(true);
                }}
                onFocus={() => setShowEmailHistory(true)}
                autoComplete="email"
                placeholder={role === "admin" ? "admin@yourdomain.com" : "you@business.com"}
                className="w-full rounded-lg px-4 py-3 text-base focus-ring"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              />
              {showEmailHistory && matchingLoginHistory.length > 0 && (
                <ul
                  className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg text-sm shadow-lg"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                >
                  {matchingLoginHistory.map((savedEmail) => (
                    <li key={savedEmail} className="flex items-center">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setEmail(savedEmail); setShowEmailHistory(false); }}
                        className="min-w-0 flex-1 truncate px-4 py-2.5 text-left hover:bg-black/5 focus-ring"
                      >
                        {savedEmail}
                      </button>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => deleteSavedEmail(savedEmail)}
                        className="mr-2 rounded-md p-1.5 text-gray-400 hover:bg-black/5 hover:text-gray-700 focus-ring"
                        aria-label={`Remove ${savedEmail} from saved emails`}
                        title="Remove saved email"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full rounded-lg px-4 py-3 pr-10 text-base focus-ring"
                  style={{ border: "1px solid var(--border)", background: "var(--card)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 rounded-md focus-ring"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                >
                  {showPw ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-base font-semibold text-white transition disabled:opacity-60 focus-ring"
              style={{ background: "var(--primary)" }}
            >
              {loading ? "Signing in…" : `Sign in as ${role === "admin" ? "Admin" : "Vendor"}`}
            </button>
          </form>

          {role === "vendor" && (
            <p className="text-center text-sm mt-5" style={{ color: "var(--ink-soft)" }}>
              New vendor?{" "}
              <Link to="/register" className="font-semibold" style={{ color: "var(--primary)" }}>
                Register your business
              </Link>
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
