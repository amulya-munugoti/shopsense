import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, PackageSearch, ShieldCheck } from "lucide-react";
import api from "../lib/api";

export default function Register() {
  const [form, setForm] = useState({ fullName: "", businessName: "", email: "", password: "", phone: "", businessAddress: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", form);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "var(--surface)" }}>
      <div className="w-full max-w-md text-center p-8 rounded-2xl shadow-lg shadow-emerald-950/5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--success-soft)" }}><CheckCircle2 size={28} style={{ color: "var(--success)" }} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "var(--success)" }}>Application submitted</p>
        <h2 className="font-display text-xl font-bold mb-3">Your account is awaiting review.</h2>
        <p className="text-sm leading-6 mb-6" style={{ color: "var(--ink-soft)" }}>You can sign in after an administrator approves your vendor account.</p>
        <button onClick={() => navigate("/login")} className="w-full py-3 rounded-xl text-sm font-semibold text-white focus-ring" style={{ background: "var(--primary)" }}>Back to sign in</button>
      </div>
    </div>;
  }

  return <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: "var(--surface)" }}>
    <main className="w-full max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <Link to="/login" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--primary)" }}><PackageSearch size={19} color="white" /></div>
          <span className="font-display text-lg font-bold">ShopSense</span>
        </Link>
        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}><ShieldCheck size={15} style={{ color: "var(--success)" }} /> Admin approval required</div>
      </div>

      <div className="rounded-2xl p-5 sm:p-7 shadow-lg shadow-emerald-950/5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "var(--primary-light)" }}>Vendor application</p>
            <h1 className="font-display text-2xl font-bold">Register your business</h1>
            <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>An administrator must approve your account before you can sign in.</p>
          </div>
        </div>

        {error && <div className="mb-5 text-sm px-4 py-3 rounded-xl" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</div>}

        <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" required value={form.fullName} onChange={update("fullName")} placeholder="Jordan Alvarez" />
          <Field label="Business name" required value={form.businessName} onChange={update("businessName")} placeholder="Alvarez Trading Co." />
          <Field label="Business email" required type="email" value={form.email} onChange={update("email")} placeholder="you@business.com" />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-soft)" }}>Password <span style={{ color: "var(--danger)" }}>*</span></label>
            <div className="relative">
              <input required minLength={6} maxLength={72} type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} placeholder="6 to 72 characters" className="w-full px-3.5 py-2.5 pr-11 rounded-lg text-sm focus-ring" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md focus-ring" style={{ color: "var(--ink-soft)" }} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <Eye size={17} /> : <EyeOff size={17} />}</button>
            </div>
          </div>
          <Field label="Phone number" optional value={form.phone} onChange={update("phone")} placeholder="+91 98765 43210" />
          <Field label="Business address" optional value={form.businessAddress} onChange={update("businessAddress")} placeholder="City, State" />
          <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Already registered? <Link to="/login" className="font-semibold" style={{ color: "var(--primary)" }}>Sign in</Link></p>
            <button type="submit" disabled={loading} className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60 focus-ring" style={{ background: "var(--primary)" }}>{loading ? "Submitting…" : "Submit application"}</button>
          </div>
        </form>
      </div>
    </main>
  </div>;
}

function Field({ label, required, optional, type = "text", value, onChange, placeholder }) {
  return <div>
    <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--ink-soft)" }}>{label} {required && <span style={{ color: "var(--danger)" }}>*</span>}{optional && <span className="normal-case font-normal"> (optional)</span>}</label>
    <input type={type} required={required} value={value} onChange={onChange} placeholder={placeholder} className="w-full px-3.5 py-2.5 rounded-lg text-sm focus-ring" style={{ border: "1px solid var(--border)", background: "var(--surface)" }} />
  </div>;
}
