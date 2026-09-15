import { useEffect, useState } from "react";
import type { FirebaseError } from "firebase/app";
import { applyActionCode, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import CinemaDashboard from "@/components/CinemaDashboard";

const falconVideo = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_052122_e77a27e6-17f1-4794-889b-3ceaa0e9e8cb.mp4";
const verificationVideo = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260801_001207_ec20d138-aa45-4b2b-ab8c-bdc71607f240.mp4";
// Login-only branding. Set VITE_LOGIN_PAGE_NAME in the local environment to change this page without affecting the dashboard.
const LOGIN_PAGE_NAME = import.meta.env.VITE_LOGIN_PAGE_NAME?.trim() || "Vibe";

function Arrow() { return <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 11h15.4M11 3.3l7.7 7.7-7.7 7.7" /></svg>; }
function GoogleMark() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.3 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>; }
function EyeIcon({ hidden }: { hidden: boolean }) { return hidden ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.8 4.2 10 7-.4 1-1.2 2.1-2.2 3.2M6.2 6.3C3.9 8 2.5 10.5 2 12c1.2 2.8 4.8 7 10 7 1.2 0 2.3-.2 3.3-.6" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5" /></svg>; }

export default function Home() {
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [actionCodeStatus, setActionCodeStatus] = useState<"idle" | "processing" | "error">("idle");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser && !currentUser.emailVerified) {
        setVerificationEmail(currentUser.email ?? "");
        setShowVerification(true);
      }
    });
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "CINEMA_AUTH_LOGOUT") {
        setUser(null);
      }
    };
    window.addEventListener("message", handleMessage);
    getRedirectResult(auth).catch((error: FirebaseError) => setNotice(error.message));
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      signOut(auth).then(() => {
        setUser(null);
        setNotice("You have been signed out.");
        if (window.location.search) window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
    const actionMode = params.get("mode");
    const actionCode = params.get("oobCode");
    if (actionMode && actionMode !== "verifyEmail" && actionCode) {
      window.location.replace(`https://vibe-login-3f072.firebaseapp.com/__/auth/action${window.location.search}`);
      return () => unsubscribe();
    }
    if (actionMode === "verifyEmail" && actionCode) {
      setActionCodeStatus("processing");
      applyActionCode(auth, actionCode)
        .then(() => window.location.replace("/?verified=1"))
        .catch((error: FirebaseError) => {
          setActionCodeStatus("error");
          setNotice(error.code === "auth/invalid-action-code" ? "This verification link is invalid or has already been used." : error.message);
        });
    }
    const resetAfterVerification = () => {
      setShowVerification(false);
      setNotice("Your email has been verified. Log in manually to continue.");
      if (window.location.search) window.history.replaceState({}, document.title, window.location.pathname);
    };
    if (params.get("verified") === "1" || document.referrer.includes("firebaseapp.com")) resetAfterVerification();
    const handlePageShow = () => {
      if (document.referrer.includes("firebaseapp.com")) resetAfterVerification();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("message", handleMessage);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!resendCooldown) return;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!showVerification || !verificationEmail) return;
    let cancelled = false;
    const checkVerification = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        await currentUser.reload();
        if (currentUser.emailVerified) {
          await signOut(auth);
          if (!cancelled) {
            setEmail(verificationEmail);
            setPassword("");
            setVerificationEmail("");
            setVerificationSuccess(true);
            setNotice("Your email has been verified. Log in manually to continue.");
          }
        }
      } catch {
        // Firebase may briefly reject a reload while the email action is being completed.
      }
    };
    const timer = window.setInterval(checkVerification, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showVerification, verificationEmail]);

  useEffect(() => {
    if (!verificationSuccess) return;
    const timer = window.setTimeout(() => {
      setShowVerification(false);
      setVerificationEmail("");
      setVerificationSuccess(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [verificationSuccess]);

  const emailError = touched.email && !email ? "Email is required." : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email address." : "";
  const passwordError = touched.password && !password ? "Password is required." : "";
  function validate() {
    setTouched({ email: true, password: true });
    return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password);
  }

  async function handleSubmit() {
    if (!validate() || isSubmitting) return;
    if (mode === "login" && isLocked) {
      setNotice("Too many failed attempts. Please wait 60 seconds before trying again.");
      return;
    }
    setNotice(""); setIsSubmitting(true);
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        setVerificationEmail(email);
        await sendEmailVerification(credential.user, { url: `${window.location.origin}/?verified=1`, handleCodeInApp: false });
        setEmail("");
        setPassword("");
        setRecoveryEmail("");
        setShowPassword(false);
        setTouched({ email: false, password: false });
        setMode("login");
        setVerificationSuccess(false);
        setShowVerification(true);
        setNotice("Verification email sent. Click Verify in that email, then log in manually.");
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (!credential.user.emailVerified) {
          setVerificationEmail(email);
          setVerificationSuccess(false);
          setShowVerification(true);
          setNotice("Please click Verify in your email before logging in.");
        } else {
          setFailedAttempts(0);
          setVerificationEmail("");
          setShowVerification(false);
          setNotice("Signed in successfully.");
        }
      }
    } catch (error) {
      const firebaseError = error as FirebaseError;
      if (mode === "login") {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setIsLocked(true);
          setNotice("Too many failed attempts. Please wait 60 seconds before trying again.");
          window.setTimeout(() => {
            setFailedAttempts(0);
            setIsLocked(false);
            setNotice("You can try logging in again now.");
          }, 60_000);
        } else {
          const message = firebaseError.code === "auth/invalid-credential" ? "Invalid email or password." : firebaseError.message;
          setNotice(`${message} ${5 - nextAttempts} attempt${5 - nextAttempts === 1 ? "" : "s"} remaining.`);
        }
      } else {
        setNotice(firebaseError.code === "auth/email-already-in-use" ? "This email already has an account. Try logging in." : firebaseError.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail || resendCooldown > 0 || resendSubmitting) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNotice("Your verification session expired. Return to login and try again.");
      return;
    }
    setResendSubmitting(true);
    setResendCooldown(60);
    try {
      await currentUser.reload();
      if (currentUser.emailVerified) {
        await signOut(auth);
        setResendCooldown(0);
        setVerificationEmail("");
        setShowVerification(false);
        setNotice("This email is already verified. You can log in now.");
        return;
      }
      await sendEmailVerification(currentUser, { url: `${window.location.origin}/?verified=1`, handleCodeInApp: false });
      setNotice(`A new verification email was sent to ${verificationEmail}.`);
    } catch (error) {
      setResendCooldown(0);
      setNotice((error as FirebaseError).message);
    } finally {
      setResendSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setNotice("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setNotice((error as FirebaseError).message);
    }
  }

  async function handleLogout() { await signOut(auth); setNotice("You have been signed out."); }

  async function handleDeleteAccount() {
    if (!user || !window.confirm("Permanently delete your account? This cannot be undone.")) return;
    try {
      await deleteUser(user);
      setUser(null);
      setEmail("");
      setPassword("");
      setNotice("Your account has been permanently deleted. You can register again now.");
    } catch (error) {
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === "auth/requires-recent-login") {
        try {
          const providerId = user.providerData[0]?.providerId;
          if (providerId === "password" && user.email && password) {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
          } else if (providerId === "google.com") {
            await reauthenticateWithPopup(user, new GoogleAuthProvider());
          } else {
            setNotice("Please sign out and log in again, then try deleting your account.");
            return;
          }
          await deleteUser(user);
          setUser(null);
          setEmail("");
          setPassword("");
          setNotice("Your account has been permanently deleted. You can register again now.");
        } catch (reauthError) {
          setNotice((reauthError as FirebaseError).message);
        }
      } else {
        setNotice(firebaseError.message);
      }
    }
  }

  async function submitRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await sendPasswordResetEmail(auth, recoveryEmail, { url: window.location.origin, handleCodeInApp: false });
      setRecoverySent(true);
    } catch (error) {
      setNotice((error as FirebaseError).message);
    }
  }

  // Prevent iframe recursion: Never render the main app/login page inside an iframe
  if (typeof window !== "undefined" && window.self !== window.top) {
    return null;
  }

  if (authLoading) {
    return (
      <main className="stage" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#020b14" }}>
        <div style={{ color: "#00f0ff", fontFamily: "monospace", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="spinner" style={{ width: "16px", height: "16px", border: "2px solid rgba(0,240,255,0.2)", borderTopColor: "#00f0ff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
          <span>Loading…</span>
        </div>
      </main>
    );
  }

  if (user && user.emailVerified && !showVerification) {
    return <CinemaDashboard user={user} />;
  }

  if (showVerification) {
    return <main className="auth-page" aria-label="Email verification required">
      <video className="background-video" autoPlay loop muted playsInline aria-hidden="true" src={verificationVideo} />
      <section className="auth-content" aria-labelledby="auth-title">
        {verificationSuccess ? <div className="verification-toast" role="status" aria-live="polite"><span className="verification-toast-icon">✓</span><span>Email verified successfully. Returning to login…</span></div> : <>
          <h1 id="auth-title" className="auth-message" data-text="Click the link in Gmail for authentication.">Click the link in Gmail for authentication.</h1>
          <p className="auth-submessage">Open the verification link on any device. This page will return to login automatically.</p>
          <button className="auth-resend" type="button" onClick={resendVerification} disabled={resendSubmitting || resendCooldown > 0}>{resendSubmitting ? "Sending verification email…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}</button>
        </>}
      </section>
    </main>;
  }

  if (actionCodeStatus === "processing") {
    return <main className="auth-page" aria-label="Verifying your email">
      <video className="background-video" autoPlay loop muted playsInline aria-hidden="true" src={verificationVideo} />
      <section className="auth-content" aria-live="polite"><h1 className="auth-message" data-text="Verifying your email…">Verifying your email…</h1></section>
    </main>;
  }

  return <main className="stage">
    <section className="photo" aria-label="Falcon video artwork"><video className="photo-img photo-img--tall" autoPlay muted loop playsInline preload="auto" poster="/manus-storage/falcon-poster_55f1cffd.jpg" aria-label="Peregrine falcon in flight"><source src={falconVideo} type="video/mp4" /></video><video className="photo-img photo-img--wide" autoPlay muted loop playsInline preload="auto" poster="/manus-storage/falcon-poster_55f1cffd.jpg" aria-hidden="true"><source src={falconVideo} type="video/mp4" /></video><div className="scrim" /><div className="hero"><div className="hl-wrap"><span className="hl hl-one">Let’s Begin</span><span className="hl hl-two">the Journey</span></div></div></section>
    <section className="pane" aria-label="Login"><div className="card"><div className="card-in">
      <div className="demo-chip">{user ? "AUTHENTICATED SESSION" : "SECURE FIREBASE AUTH"}</div>
      <h1>{mode === "signup" ? "Start your journey with " : "Welcome back to "}<span>{LOGIN_PAGE_NAME}</span></h1><p className="sub">{user ? `Signed in as ${user.email ?? "your account"}.` : mode === "signup" ? "Create your account and move ahead." : "Road ahead."}</p>
      {user ? <><button className="login-button" type="button" onClick={handleLogout}><span>Sign out</span><Arrow /></button><button className="delete-account-button" type="button" onClick={handleDeleteAccount}>Delete my account</button><p className="demo-notice visible" aria-live="polite">Your Firebase session is active.</p></> : <>
        <div className={`field email-field${emailError ? " has-error" : ""}`}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onBlur={() => setTouched((current) => ({ ...current, email: true }))} placeholder="Eg. johndoe@gmail.com" autoComplete="email" aria-label="Email address" aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "email-error" : undefined} />{emailError && <span className="field-error" id="email-error" role="alert">{emailError}</span>}</div>
        <div className={`field password-field${passwordError ? " has-error" : ""}`}><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} onBlur={() => setTouched((current) => ({ ...current, password: true }))} placeholder="Password" autoComplete="current-password" aria-label="Password" aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? "password-error" : undefined} /><button className="show-password" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><EyeIcon hidden={!showPassword} /></button>{passwordError && <span className="field-error" id="password-error" role="alert">{passwordError}</span>}</div>
        <button className={`login-button${isSubmitting ? " is-loading" : ""}`} type="button" onClick={handleSubmit} disabled={isSubmitting} aria-busy={isSubmitting}><span>{isSubmitting ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create account" : "Login"}</span>{isSubmitting ? <span className="spinner" aria-hidden="true" /> : <Arrow />}</button>
        <button className="forgot-link" type="button" onClick={() => { setRecoveryEmail(email); setRecoverySent(false); setForgotOpen(true); }}>Forgot password?</button>
        <div className="divider"><i /><b>OR</b><i /></div><button className="google-button" type="button" onClick={handleGoogleLogin}><GoogleMark /><span>Continue with Google</span></button><p className="bottom">{mode === "signup" ? "Already have an account?" : "Don't have an account?"} <button type="button" onClick={() => { setMode((current) => current === "login" ? "signup" : "login"); setNotice(""); setTouched({ email: false, password: false }); }}>{mode === "signup" ? "Log in" : "Start Free"}</button></p><p className={`demo-notice${notice ? " visible" : ""}`} aria-live="polite">{notice || "Protected by Firebase Auth."}</p>{verificationEmail && <button className="resend-link" type="button" onClick={resendVerification} disabled={resendSubmitting || resendCooldown > 0}>{resendSubmitting ? "Sending verification email…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}</button>}
      </>}
    </div></div></section>
    {forgotOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setForgotOpen(false); }}><section className="recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><button className="modal-close" type="button" onClick={() => setForgotOpen(false)} aria-label="Close password recovery">×</button>{recoverySent ? <div className="recovery-success" role="status"><div className="success-mark">✓</div><p className="modal-kicker">RESET LINK SENT</p><h2>Check your inbox.</h2><p>We’ve sent a password reset link to <strong>{recoveryEmail}</strong>.</p><button className="modal-primary" type="button" onClick={() => setForgotOpen(false)}>Back to login</button></div> : <form onSubmit={submitRecovery}><p className="modal-kicker">PASSWORD RECOVERY</p><h2 id="recovery-title">Reset your password</h2><p className="modal-copy">Enter your email address and we’ll send you a secure reset link.</p><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="you@company.com" required autoFocus /><button className="modal-primary" type="submit">Send Reset Link <Arrow /></button></form>}</section></div>}
  </main>;
}
