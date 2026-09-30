"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LandingPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        window.location.href = "/";
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
          window.location.href = "/";
        }
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      {/* Navigation */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
        <div className="container">
          <a className="navbar-brand fw-bold" href="#">EduJournal</a>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="flex-grow-1 d-flex align-items-center">
        <div className="container">
          <div className="row align-items-center justify-content-center">
            
            <div className="col-lg-6 text-center text-lg-start mb-5 mb-lg-0">
              <h1 className="display-4 fw-bold text-dark mb-3">
                Seamless Access to Your Platform
              </h1>
              <p className="lead text-muted mb-4">
                Join our integrated platform today. We've built a frictionless onboarding experience powered by Next.js and Keycloak.
              </p>
            </div>

            <div className="col-lg-5 offset-lg-1">
              <div className="card shadow-lg border-0 rounded-lg">
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
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
