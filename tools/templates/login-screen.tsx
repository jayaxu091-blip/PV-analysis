// Used by prepare_exact_interface.mjs inside the original app's React runtime.
// Original auth state/handlers are preserved; only the login rendering changes.
function __VaultLabAuthIcon({ provider }: { provider: "google" | "email" }) {
  if (provider === "google") return <svg className="provider-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.06.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.59C7.19 7.71 9.4 5.95 12 5.95Z"/></svg>;
  return <svg className="provider-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7M3 18l6-6m12 6-6-6"/></svg>;
}
return (<main className="login-page">
      <div className="login-content">
        <div className="login-brand">
          <div className="login-logo-surface"><img className="login-logo" src={__VaultLabLogo} alt="VaultLab: pole vaulter with tracked body landmarks"/></div>
          <h1 className="visually-hidden">VaultLab</h1>
          <p>A closer look at every vault.</p>
        </div>
        <div className="login-actions">
          {!emailOpen ? <>
            <button className="login-provider" type="button" onClick={x} disabled={v}>
              <__VaultLabAuthIcon provider="google"/><span>Continue with Google</span>
            </button>
            <button className="login-provider" type="button" onClick={() => { b(""); setEmailOpen(true); }} disabled={v}>
              <__VaultLabAuthIcon provider="email"/><span>Continue with Email</span>
            </button>
          </> : <div className="login-email-panel">
            <button className="login-back" type="button" disabled={v} onClick={() => { setEmailOpen(false); b(""); }}>← All sign-in options</button>
            <h2>{i === "sign-in" ? "Welcome back" : "Create your account"}</h2>
            <form className="auth-form" onSubmit={L}>
              <label htmlFor="login-email">Email<input id="login-email" type="email" autoComplete="email" value={c} onChange={event => f(event.target.value)} disabled={v} required/></label>
              <label htmlFor="login-password">Password<input id="login-password" type="password" autoComplete={i === "sign-in" ? "current-password" : "new-password"} value={h} onChange={event => m(event.target.value)} minLength={6} disabled={v} required/></label>
              <button className="login-provider" type="submit" disabled={v}>{v ? "Please wait…" : i === "sign-in" ? "Sign in" : "Create account"}</button>
            </form>
            <p className="login-switch">{i === "sign-in" ? "New to VaultLab?" : "Already have an account?"} <button type="button" disabled={v} onClick={() => { r(i === "sign-in" ? "sign-up" : "sign-in"); b(""); }}>{i === "sign-in" ? "Create an account" : "Sign in"}</button></p>
          </div>}
          {v && !emailOpen && <p className="login-status" role="status">Complete sign-in in the window that opens.</p>}
          {E && <p className="login-error" role="alert">{E}</p>}
          <button className="login-demo" type="button" onClick={l.onDemo} disabled={v}>Explore the demo</button>
          <p className="login-note">Your videos and training records stay in this browser.</p>
        </div>
      </div>
    </main>);
