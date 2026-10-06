"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
<<<<<<< HEAD
import { useRouter } from "next/navigation";
=======
>>>>>>> origin/dev
import { Modal } from 'react-bootstrap';
import { useTranslations } from 'next-intl';

export default function LandingPage() {
  const t = useTranslations("landing");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
<<<<<<< HEAD
  const [loading, setLoading] = useState(false);
  const router = useRouter();

=======
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
>>>>>>> origin/dev
  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

<<<<<<< HEAD
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(t("auth.invalidLogin"));
      setLoading(false);
    } else {
      if (!window.location.hostname.startsWith('platform.')) {
        window.location.href = window.location.protocol + "//platform." + window.location.host + "/";
      } else {
        router.push('/'); router.refresh();
      }
    }
=======
    const locale = window.location.pathname.match(/^\/(en|da|fr|es|de)(?:\/|$)/)?.[1] || 'en';
    const callbackUrl = window.location.hostname.startsWith('platform.')
      ? `/${locale}`
      : `/${locale}/dashboard/personal`;
    await signIn("keycloak", { callbackUrl });
>>>>>>> origin/dev
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
<<<<<<< HEAD
=======
    setNotice("");
>>>>>>> origin/dev

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, firstName, lastName })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to register");
      }

<<<<<<< HEAD
      const loginRes = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        setError(t("auth.autoLoginFailed"));
        setIsLogin(true);
        setLoading(false);
      } else {
        if (!window.location.hostname.startsWith('platform.')) {
          window.location.href = window.location.protocol + "//platform." + window.location.host + "/";
        } else {
          router.push('/'); router.refresh();
        }
      }
=======
      setIsLogin(true);
      setNotice("Your account was created. Check your email to verify it before signing in.");
      setLoading(false);
>>>>>>> origin/dev

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const openModal = () => {
    setIsLogin(true);
    setError("");
<<<<<<< HEAD
=======
    setNotice("");
>>>>>>> origin/dev
    setShowAuthModal(true);
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-white">
      <nav className="navbar navbar-light bg-white border-bottom py-3">
        <div className="container d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center text-dark text-decoration-none">
            <i className="bi bi-book fs-4 me-2" style={{ color: '#0d6efd' }}></i>
            <span className="fs-5 fw-bold" style={{ color: '#1a1d2e' }}>{t("nav.title")}</span>
          </div>
          <button className="btn btn-dark fw-semibold px-4" style={{ backgroundColor: '#111827' }} onClick={openModal}>
            {t("nav.loginButton")}
          </button>
        </div>
      </nav>

      <main className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3 mt-5">
        <div className="mb-4">
          <span className="badge rounded-pill bg-primary bg-opacity-10 text-primary px-3 py-2 fw-semibold" style={{ color: '#5b6cf9 !important' }}>
            {t("hero.badge")}
          </span>
        </div>
        
        <h1 className="display-4 fw-bolder mb-3" style={{ color: '#111827', maxWidth: '800px', lineHeight: '1.2' }}>
          {t("hero.titleLine1")} <br />
          {t("hero.titleLine2")} <span style={{ color: '#5c6df9' }}>{t("hero.titleLine3")}</span>
        </h1>
        
        <p className="lead text-muted mb-5 mx-auto" style={{ maxWidth: '700px', fontSize: '1.1rem' }}>
          {t("hero.subtitle")}
        </p>

        <div className="container mt-4 mb-5">
          <div className="row g-4 justify-content-center">
            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-pen"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>{t("features.card1Title")}</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {t("features.card1Desc")}
                </p>
              </div>
            </div>

            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-lock"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>{t("features.card2Title")}</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {t("features.card2Desc")}
                </p>
              </div>
            </div>

            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-brain"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>{t("features.card3Title")}</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {t("features.card3Desc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center py-4 border-top">
        <small className="text-muted">
          {t("footer.text")}
        </small>
      </footer>

      <Modal show={showAuthModal} onHide={() => setShowAuthModal(false)} centered>
        <div className="card shadow-lg border-0 rounded-lg w-100">
          <div className="card-header bg-white pb-0 border-0 pt-4">
            <ul className="nav nav-tabs nav-fill mb-0">
              <li className="nav-item">
                <button 
                  className={`nav-link fw-bold border-0 ${isLogin ? 'active border-bottom border-primary border-3 text-primary' : 'text-muted'}`}
                  onClick={() => { setIsLogin(true); setError(""); }}
                  style={{ backgroundColor: "transparent" }}
                >
                  {t("auth.signInTab")}
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-link fw-bold border-0 ${!isLogin ? 'active border-bottom border-primary border-3 text-primary' : 'text-muted'}`}
                  onClick={() => { setIsLogin(false); setError(""); }}
                  style={{ backgroundColor: "transparent" }}
                >
                  {t("auth.createAccountTab")}
                </button>
              </li>
            </ul>
          </div>

          <div className="card-body p-5">
            {error && <div className="alert alert-danger">{error}</div>}
<<<<<<< HEAD

            {isLogin ? (
              <form onSubmit={handleLogin}>
                <div className="form-floating mb-3">
                  <input type="text" className="form-control" id="loginUser" placeholder={t("auth.username")} value={username} onChange={e => setUsername(e.target.value)} required />
                  <label htmlFor="loginUser">{t("auth.username")}</label>
                </div>
                <div className="form-floating mb-4">
                  <input type="password" className="form-control" id="loginPass" placeholder={t("auth.password")} value={password} onChange={e => setPassword(e.target.value)} required />
                  <label htmlFor="loginPass">{t("auth.password")}</label>
                </div>
=======
            {notice && <div className="alert alert-info" role="status">{notice}</div>}

            {isLogin ? (
              <form onSubmit={handleLogin}>
>>>>>>> origin/dev
                <button className="btn btn-primary w-100 py-3 fw-bold" type="submit" disabled={loading}>
                  {loading ? t("auth.signingIn") : t("auth.signInButton")}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="row g-2 mb-3">
                  <div className="col-md-6 form-floating">
                    <input type="text" className="form-control" id="regFirst" placeholder={t("auth.firstName")} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    <label htmlFor="regFirst">{t("auth.firstName")}</label>
                  </div>
                  <div className="col-md-6 form-floating">
                    <input type="text" className="form-control" id="regLast" placeholder={t("auth.lastName")} value={lastName} onChange={e => setLastName(e.target.value)} required />
                    <label htmlFor="regLast">{t("auth.lastName")}</label>
                  </div>
                </div>
                <div className="form-floating mb-3">
                  <input type="email" className="form-control" id="regEmail" placeholder={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)} required />
                  <label htmlFor="regEmail">{t("auth.email")}</label>
                </div>
                <div className="form-floating mb-3">
                  <input type="text" className="form-control" id="regUser" placeholder={t("auth.username")} value={username} onChange={e => setUsername(e.target.value)} required />
                  <label htmlFor="regUser">{t("auth.username")}</label>
                </div>
                <div className="form-floating mb-4">
                  <input type="password" className="form-control" id="regPass" placeholder={t("auth.password")} value={password} onChange={e => setPassword(e.target.value)} required />
                  <label htmlFor="regPass">{t("auth.password")}</label>
                </div>
                <button className="btn btn-success w-100 py-3 fw-bold" type="submit" disabled={loading}>
                  {loading ? t("auth.creatingAccount") : t("auth.createAccountButton")}
                </button>
              </form>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
