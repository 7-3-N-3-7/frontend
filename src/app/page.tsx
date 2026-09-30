"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Modal } from 'react-bootstrap';

export default function LandingPage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid username or password");
      setLoading(false);
    } else {
      // Redirect to the platform domain so they see the dashboard
      if (!window.location.hostname.startsWith('platform.')) {
        window.location.href = window.location.protocol + "//platform." + window.location.host + "/";
      } else {
        router.push('/'); router.refresh();
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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

      // Automatically log them in after registration
      const loginRes = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        setError("Account created, but auto-login failed. Please sign in.");
        setIsLogin(true);
        setLoading(false);
      } else {
        if (!window.location.hostname.startsWith('platform.')) {
          window.location.href = window.location.protocol + "//platform." + window.location.host + "/";
        } else {
          router.push('/'); router.refresh();
        }
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const openModal = () => {
    setIsLogin(true);
    setError("");
    setShowAuthModal(true);
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-white">
      {/* Top Navigation */}
      <nav className="navbar navbar-light bg-white border-bottom py-3">
        <div className="container d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center text-dark text-decoration-none">
            <i className="bi bi-book fs-4 me-2" style={{ color: '#0d6efd' }}></i>
            <span className="fs-5 fw-bold" style={{ color: '#1a1d2e' }}>EduJournal</span>
          </div>
          <button className="btn btn-dark fw-semibold px-4" style={{ backgroundColor: '#111827' }} onClick={openModal}>
            Register / Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3 mt-5">
        <div className="mb-4">
          <span className="badge rounded-pill bg-primary bg-opacity-10 text-primary px-3 py-2 fw-semibold" style={{ color: '#5b6cf9 !important' }}>
            For Educational Purposes
          </span>
        </div>
        
        <h1 className="display-4 fw-bolder mb-3" style={{ color: '#111827', maxWidth: '800px', lineHeight: '1.2' }}>
          Reflect, Learn, and Grow <br />
          with <span style={{ color: '#5c6df9' }}>EduJournal</span>
        </h1>
        
        <p className="lead text-muted mb-5 mx-auto" style={{ maxWidth: '700px', fontSize: '1.1rem' }}>
          A dedicated platform for secure journal tracking and seamless appointment booking designed specifically for therapists and their clients.
        </p>

        {/* Feature Cards */}
        <div className="container mt-4 mb-5">
          <div className="row g-4 justify-content-center">
            {/* Card 1 */}
            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-pen"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>Daily Entries</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  Write down your daily learnings and reflections with an intuitive, distraction-free editor.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-lock"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>Private & Secure</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  Your journals are encrypted and private, ensuring a safe space for personal educational reflection.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-100 border rounded-4 shadow-sm text-start p-4 border-0" style={{ border: '1px solid #eef0f4 !important', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded bg-primary bg-opacity-10 mb-3" style={{ width: '40px', height: '40px', color: '#5b6cf9' }}>
                  <i className="bi bi-brain"></i>
                </div>
                <h5 className="fw-bold mb-3" style={{ color: '#111827' }}>Cognitive Growth</h5>
                <p className="text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  Look back at past entries to see how your understanding has evolved over time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 border-top">
        <small className="text-muted">
          © 2026 EduJournal. This is an educational project.
        </small>
      </footer>

      {/* Auth Modal */}
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
                  Sign In
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-link fw-bold border-0 ${!isLogin ? 'active border-bottom border-primary border-3 text-primary' : 'text-muted'}`}
                  onClick={() => { setIsLogin(false); setError(""); }}
                  style={{ backgroundColor: "transparent" }}
                >
                  Create Account
                </button>
              </li>
            </ul>
          </div>

          <div className="card-body p-5">
            {error && <div className="alert alert-danger">{error}</div>}

            {isLogin ? (
              <form onSubmit={handleLogin}>
                <div className="form-floating mb-3">
                  <input type="text" className="form-control" id="loginUser" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
                  <label htmlFor="loginUser">Username</label>
                </div>
                <div className="form-floating mb-4">
                  <input type="password" className="form-control" id="loginPass" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                  <label htmlFor="loginPass">Password</label>
                </div>
                <button className="btn btn-primary w-100 py-3 fw-bold" type="submit" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="row g-2 mb-3">
                  <div className="col-md-6 form-floating">
                    <input type="text" className="form-control" id="regFirst" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    <label htmlFor="regFirst">First Name</label>
                  </div>
                  <div className="col-md-6 form-floating">
                    <input type="text" className="form-control" id="regLast" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
                    <label htmlFor="regLast">Last Name</label>
                  </div>
                </div>
                <div className="form-floating mb-3">
                  <input type="email" className="form-control" id="regEmail" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                  <label htmlFor="regEmail">Email address</label>
                </div>
                <div className="form-floating mb-3">
                  <input type="text" className="form-control" id="regUser" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
                  <label htmlFor="regUser">Username</label>
                </div>
                <div className="form-floating mb-4">
                  <input type="password" className="form-control" id="regPass" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
                  <label htmlFor="regPass">Password</label>
                </div>
                <button className="btn btn-success w-100 py-3 fw-bold" type="submit" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
