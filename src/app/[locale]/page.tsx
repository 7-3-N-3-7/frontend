"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Modal } from 'react-bootstrap';
import { useTranslations, useLocale } from 'next-intl';
import { LanguageSwitcher, SupportedUiLocale, resolveUiLocale } from '@/features/i18n/I18nFeature';

interface RegisterModalCopy {
  intro: string;
  heroRegisterCta: string;
  step1Title: string;
  step2Title: string;
  nextStepBtn: string;
  prevStepBtn: string;
  step1RequiredError: string;
  passwordHint: string;
  passwordTooShortError: string;
  dobLabel: string;
  dobPlaceholder: string;
  phoneLabel: string;
  addressLabel: string;
  addressPlaceholder: string;
  postalLabel: string;
  postalPlaceholder: string;
  createdNotice: string;
  failedRegisterError: string;
  closeModalAriaLabel: string;
  authRequiredNotice: string;
  emailVerifiedNotice: string;
  dismissBannerAriaLabel: string;
}

const REGISTER_MODAL_COPY: Record<SupportedUiLocale, RegisterModalCopy> = {
  da: {
    intro: "Personlig klientregistrering: Opret din krypterede konto i to overskuelige trin.",
    heroRegisterCta: "Kom i gang",
    step1Title: "Trin 1 af 2 — Navn & brugernavn",
    step2Title: "Trin 2 af 2 — E-mail, adgangskode & profil",
    nextStepBtn: "Fortsæt til trin 2",
    prevStepBtn: "Tilbage",
    step1RequiredError: "Udfyld venligst fornavn, efternavn og brugernavn før du går videre.",
    passwordHint: "Skal være mindst 8 tegn.",
    passwordTooShortError: "Adgangskoden skal være på mindst 8 tegn.",
    dobLabel: "Fødselsdato",
    dobPlaceholder: "Fødselsdato",
    phoneLabel: "Telefonnummer",
    addressLabel: "Adresse",
    addressPlaceholder: "Adresse",
    postalLabel: "Postnummer",
    postalPlaceholder: "Postnummer",
    createdNotice: "Din konto er oprettet! Vi har sendt en bekræftelsesmail til din indbakke og logger dig nu ind...",
    failedRegisterError: "Kunne ikke oprette bruger",
    closeModalAriaLabel: "Luk loginvindue",
    authRequiredNotice: "Log venligst ind for at åbne din portal.",
    emailVerifiedNotice: "Din e-mail er nu bekræftet! Log ind for at fortsætte til din portal.",
    dismissBannerAriaLabel: "Luk besked",
  },
  en: {
    intro: "Personal client registration: Create your encrypted account in two clear steps.",
    heroRegisterCta: "Get started",
    step1Title: "Step 1 of 2 — Name & username",
    step2Title: "Step 2 of 2 — Email, password & details",
    nextStepBtn: "Continue to step 2",
    prevStepBtn: "Back",
    step1RequiredError: "Please enter first name, last name, and username to continue.",
    passwordHint: "Must be at least 8 characters.",
    passwordTooShortError: "Password must be at least 8 characters.",
    dobLabel: "Date of Birth",
    dobPlaceholder: "Date of Birth",
    phoneLabel: "Phone Number",
    addressLabel: "Home Address",
    addressPlaceholder: "Home Address",
    postalLabel: "Postal Code",
    postalPlaceholder: "Postal Code",
    createdNotice: "Your account has been created! We sent a verification email to your inbox and are signing you in...",
    failedRegisterError: "Failed to register",
    closeModalAriaLabel: "Close sign-in modal",
    authRequiredNotice: "Please sign in to access your portal.",
    emailVerifiedNotice: "Your email is now verified! Sign in to continue to your portal.",
    dismissBannerAriaLabel: "Dismiss message",
  },
  fr: {
    intro: "Inscription client : créez votre compte chiffré en deux étapes simples.",
    heroRegisterCta: "Commencer",
    step1Title: "Étape 1 sur 2 — Nom et identifiant",
    step2Title: "Étape 2 sur 2 — E-mail, mot de passe et profil",
    nextStepBtn: "Continuer vers l'étape 2",
    prevStepBtn: "Retour",
    step1RequiredError: "Veuillez saisir votre prénom, nom et nom d'utilisateur.",
    passwordHint: "Doit contenir au moins 8 caractères.",
    passwordTooShortError: "Le mot de passe doit contenir au moins 8 caractères.",
    dobLabel: "Date de naissance",
    dobPlaceholder: "Date de naissance",
    phoneLabel: "Numéro de téléphone",
    addressLabel: "Adresse postale",
    addressPlaceholder: "Adresse postale",
    postalLabel: "Code postal",
    postalPlaceholder: "Code postal",
    createdNotice: "Votre compte a été créé ! Nous avons envoyé un e-mail de vérification et nous vous connectons...",
    failedRegisterError: "Échec de l'inscription",
    closeModalAriaLabel: "Fermer la fenêtre de connexion",
    authRequiredNotice: "Veuillez vous connecter pour accéder à votre portail.",
    emailVerifiedNotice: "Votre e-mail est maintenant vérifié ! Connectez-vous pour accéder à votre portail.",
    dismissBannerAriaLabel: "Fermer le message",
  },
  es: {
    intro: "Registro personal de cliente: crea tu cuenta cifrada en dos pasos claros.",
    heroRegisterCta: "Comenzar",
    step1Title: "Paso 1 de 2 — Nombre y usuario",
    step2Title: "Paso 2 de 2 — Correo, contraseña y perfil",
    nextStepBtn: "Continuar al paso 2",
    prevStepBtn: "Atrás",
    step1RequiredError: "Por favor, completa nombre, apellidos y usuario antes de continuar.",
    passwordHint: "Debe tener al menos 8 caracteres.",
    passwordTooShortError: "La contraseña debe tener al menos 8 caracteres.",
    dobLabel: "Fecha de nacimiento",
    dobPlaceholder: "Fecha de nacimiento",
    phoneLabel: "Número de teléfono",
    addressLabel: "Dirección",
    addressPlaceholder: "Dirección",
    postalLabel: "Código postal",
    postalPlaceholder: "Código postal",
    createdNotice: "¡Tu cuenta ha sido creada! Enviamos un correo de verificación a tu bandeja y estamos iniciando sesión...",
    failedRegisterError: "Error al registrar la cuenta",
    closeModalAriaLabel: "Cerrar ventana de acceso",
    authRequiredNotice: "Inicia sesión para acceder a tu portal.",
    emailVerifiedNotice: "¡Tu correo ya está verificado! Inicia sesión para continuar hacia tu portal.",
    dismissBannerAriaLabel: "Cerrar mensaje",
  },
  de: {
    intro: "Persönliche Klientenregistrierung: Erstellen Sie Ihr verschlüsseltes Konto in zwei Schritten.",
    heroRegisterCta: "Jetzt starten",
    step1Title: "Schritt 1 von 2 — Name & Benutzername",
    step2Title: "Schritt 2 von 2 — E-Mail, Passwort & Profil",
    nextStepBtn: "Weiter zu Schritt 2",
    prevStepBtn: "Zurück",
    step1RequiredError: "Bitte füllen Sie Vorname, Nachname und Benutzername aus.",
    passwordHint: "Muss mindestens 8 Zeichen lang sein.",
    passwordTooShortError: "Das Passwort muss mindestens 8 Zeichen lang sein.",
    dobLabel: "Geburtsdatum",
    dobPlaceholder: "Geburtsdatum",
    phoneLabel: "Telefonnummer",
    addressLabel: "Wohnadresse",
    addressPlaceholder: "Wohnadresse",
    postalLabel: "Postleitzahl",
    postalPlaceholder: "Postleitzahl",
    createdNotice: "Ihr Konto wurde erstellt! Wir haben eine Bestätigungs-E-Mail gesendet und melden Sie jetzt an...",
    failedRegisterError: "Registrierung fehlgeschlagen",
    closeModalAriaLabel: "Anmeldefenster schließen",
    authRequiredNotice: "Bitte melden Sie sich an, um auf das Portal zuzugreifen.",
    emailVerifiedNotice: "Ihre E-Mail-Adresse ist jetzt bestätigt! Melden Sie sich an, um Ihr Portal zu öffnen.",
    dismissBannerAriaLabel: "Nachricht schließen",
  },
};

export default function LandingPage() {
  const t = useTranslations("landing");
  const activeLocale = useLocale();
  const registerCopy = REGISTER_MODAL_COPY[resolveUiLocale(activeLocale)];
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRequiredBanner, setAuthRequiredBanner] = useState(false);
  const [emailVerifiedBanner, setEmailVerifiedBanner] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailVerified") === "1") {
      setEmailVerifiedBanner(true);
    } else if (params.get("authRequired") === "1") {
      setAuthRequiredBanner(true);
    }
  }, []);

  const getPlatformDashboardUrl = (locale: string) => {
    const { protocol, hostname, port } = window.location;
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]";
    const targetHost =
      hostname.startsWith("platform.") || isLocalHost
        ? hostname
        : `platform.${hostname}`;
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${targetHost}${portSuffix}/${locale}/dashboard/personal`;
  };

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
      setError(t("auth.invalidLogin"));
      setLoading(false);
    } else {
      const locale =
        activeLocale ||
        window.location.pathname.match(/^\/(en|da|fr|es|de)(?:\/|$)/)?.[1] ||
        'da';
      window.location.href = getPlatformDashboardUrl(locale);
    }
  };

  const handleNextRegisterStep = () => {
    if (!firstName.trim() || !lastName.trim() || !username.trim()) {
      setError(registerCopy.step1RequiredError);
      return;
    }
    setError("");
    setRegisterStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(registerCopy.passwordTooShortError);
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          email,
          firstName,
          lastName,
          dateOfBirth,
          homeAddress,
          postalCode,
          phoneNumber,
          locale: resolveUiLocale(activeLocale),
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || registerCopy.failedRegisterError);
      }

      setIsLogin(true);
      setRegisterStep(1);
      setNotice(registerCopy.createdNotice);
      setLoading(false);
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
        const locale =
          activeLocale ||
          window.location.pathname.match(/^\/(en|da|fr|es|de)(?:\/|$)/)?.[1] ||
          'da';
        window.location.href = `${getPlatformDashboardUrl(locale)}?welcome=1`;
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const openModal = () => {
    setIsLogin(true);
    setRegisterStep(1);
    setPassword("");
    setError("");
    setNotice("");
    setShowAuthModal(true);
  };

  const openRegisterModal = () => {
    setIsLogin(false);
    setRegisterStep(1);
    setPassword("");
    setError("");
    setNotice("");
    setShowAuthModal(true);
  };

  return (
    <div className="min-vh-100 d-flex flex-column overflow-x-hidden" style={{ backgroundColor: '#f8fafc' }}>
      <nav className="navbar navbar-light bg-white border-bottom py-3">
        <div className="container d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <div className="d-flex align-items-center text-dark text-decoration-none">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-3 me-2 text-white"
              style={{ width: '36px', height: '36px', backgroundColor: '#0f766e' }}
            >
              <i className="bi bi-heart-pulse fs-5" aria-hidden="true"></i>
            </span>
            <span className="fs-5 fw-bold" style={{ color: '#0f172a' }}>{t("nav.title")}</span>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <LanguageSwitcher
              currentLocale={activeLocale}
              onLocaleNavigate={(nextLocale) => {
                router.push(`/${nextLocale}`);
                router.refresh();
              }}
            />
            <button
              type="button"
              className="btn fw-semibold px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
              onClick={openModal}
            >
              {t("nav.loginButton")}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3 py-5">
        {emailVerifiedBanner && (
          <div
            data-testid="email-verified-banner"
            role="status"
            className="mb-4 flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-left text-sm text-emerald-950"
          >
            <div className="flex items-center gap-2 font-medium">
              <i className="bi bi-check-circle-fill text-emerald-700" aria-hidden="true" />
              <span>{registerCopy.emailVerifiedNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openModal}
                className="min-h-11 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                {t("nav.loginButton")}
              </button>
              <button
                type="button"
                aria-label={registerCopy.dismissBannerAriaLabel}
                onClick={() => setEmailVerifiedBanner(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {authRequiredBanner && (
          <div
            data-testid="auth-required-banner"
            role="status"
            className="mb-4 flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-950"
          >
            <span className="font-medium">{registerCopy.authRequiredNotice}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openModal}
                className="min-h-11 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                {t("nav.loginButton")}
              </button>
              <button
                type="button"
                aria-label={registerCopy.closeModalAriaLabel}
                onClick={() => setAuthRequiredBanner(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        <div className="mb-3">
          <span
            className="badge rounded-pill px-3 py-2 fw-semibold"
            style={{ backgroundColor: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' }}
          >
            {t("hero.badge")}
          </span>
        </div>

        <h1 className="display-4 fw-bolder mb-3" style={{ color: '#0f172a', maxWidth: '800px', lineHeight: '1.2' }}>
          {t("hero.titleLine1")} <br />
          {t("hero.titleLine2")} <span style={{ color: '#0f766e' }}>{t("hero.titleLine3")}</span>
        </h1>

        <p className="lead text-muted mb-4 mx-auto" style={{ maxWidth: '680px', fontSize: '1.1rem' }}>
          {t("hero.subtitle")}
        </p>

        <div className="d-flex flex-wrap justify-content-center gap-3 mb-5">
          <button
            type="button"
            data-testid="hero-cta-register"
            onClick={openRegisterModal}
            className="btn fw-semibold px-4 text-white shadow-sm"
            style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
          >
            <i className="bi bi-person-plus me-2" aria-hidden="true"></i>
            {registerCopy.heroRegisterCta}
          </button>
          <button
            type="button"
            data-testid="hero-cta-login"
            onClick={openModal}
            className="btn fw-semibold px-4 bg-white"
            style={{ color: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
          >
            <i className="bi bi-box-arrow-in-right me-2" aria-hidden="true"></i>
            {t("nav.loginButton")}
          </button>
        </div>

        <div className="container mt-2 mb-4">
          <div className="row g-4 justify-content-center">
            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-full rounded-4 bg-white text-start p-4" style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded-3 mb-3" style={{ width: '44px', height: '44px', backgroundColor: '#f0fdfa', color: '#0f766e' }}>
                  <i className="bi bi-journal-bookmark fs-5" aria-hidden="true"></i>
                </div>
                <h2 className="fs-5 fw-bold mb-2" style={{ color: '#0f172a' }}>{t("features.card1Title")}</h2>
                <p className="text-muted mb-0" style={{ fontSize: '0.92rem', lineHeight: '1.6' }}>
                  {t("features.card1Desc")}
                </p>
              </div>
            </div>

            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-full rounded-4 bg-white text-start p-4" style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded-3 mb-3" style={{ width: '44px', height: '44px', backgroundColor: '#f0fdfa', color: '#0f766e' }}>
                  <i className="bi bi-shield-lock fs-5" aria-hidden="true"></i>
                </div>
                <h2 className="fs-5 fw-bold mb-2" style={{ color: '#0f172a' }}>{t("features.card2Title")}</h2>
                <p className="text-muted mb-0" style={{ fontSize: '0.92rem', lineHeight: '1.6' }}>
                  {t("features.card2Desc")}
                </p>
              </div>
            </div>

            <div className="col-md-4" style={{ maxWidth: '350px' }}>
              <div className="card h-full rounded-4 bg-white text-start p-4" style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)' }}>
                <div className="d-inline-flex justify-content-center align-items-center rounded-3 mb-3" style={{ width: '44px', height: '44px', backgroundColor: '#f0fdfa', color: '#0f766e' }}>
                  <i className="bi bi-clipboard2-pulse fs-5" aria-hidden="true"></i>
                </div>
                <h2 className="fs-5 fw-bold mb-2" style={{ color: '#0f172a' }}>{t("features.card3Title")}</h2>
                <p className="text-muted mb-0" style={{ fontSize: '0.92rem', lineHeight: '1.6' }}>
                  {t("features.card3Desc")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center py-4 bg-white border-top">
        <small className="text-muted">
          {t("footer.text")}
        </small>
      </footer>

      <Modal
        show={showAuthModal}
        onHide={() => setShowAuthModal(false)}
        centered
        dialogClassName="mx-auto max-w-md w-full px-3"
      >
        <div className="card shadow-lg border-0 rounded-4 w-full">
          <div className="card-header bg-white pb-0 border-0 pt-3">
            <div className="d-flex justify-content-end mb-1">
              <button
                type="button"
                data-testid="close-auth-modal"
                aria-label={registerCopy.closeModalAriaLabel}
                onClick={() => setShowAuthModal(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <ul className="nav nav-tabs nav-fill mb-0" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isLogin}
                  className="nav-link fw-bold border-0"
                  onClick={() => {
                    setIsLogin(true);
                    setRegisterStep(1);
                    setPassword("");
                    setError("");
                    setNotice("");
                  }}
                  style={{
                    minHeight: '44px',
                    backgroundColor: 'transparent',
                    color: isLogin ? '#0f766e' : '#64748b',
                    borderBottom: isLogin ? '3px solid #0f766e' : '3px solid transparent',
                  }}
                >
                  {t("auth.signInTab")}
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isLogin}
                  className="nav-link fw-bold border-0"
                  onClick={() => {
                    setIsLogin(false);
                    setRegisterStep(1);
                    setPassword("");
                    setError("");
                    setNotice("");
                  }}
                  style={{
                    minHeight: '44px',
                    backgroundColor: 'transparent',
                    color: !isLogin ? '#0f766e' : '#64748b',
                    borderBottom: !isLogin ? '3px solid #0f766e' : '3px solid transparent',
                  }}
                >
                  {t("auth.createAccountTab")}
                </button>
              </li>
            </ul>
          </div>

          <div className="card-body p-4">
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
            {notice && <div className="alert alert-success" role="status">{notice}</div>}

            {isLogin ? (
              <form noValidate onSubmit={handleLogin}>
                <div className="mb-3">
                  <label htmlFor="loginUser" className="form-label fw-semibold small text-secondary mb-1">
                    {t("auth.username")} *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    style={{ minHeight: '44px' }}
                    id="loginUser"
                    placeholder={t("auth.username")}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="loginPass" className="form-label fw-semibold small text-secondary mb-1">
                    {t("auth.password")} *
                  </label>
                  <input
                    type="password"
                    required
                    className="form-control"
                    style={{ minHeight: '44px' }}
                    id="loginPass"
                    placeholder={t("auth.password")}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <button
                  className="btn w-full fw-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? t("auth.signingIn") : t("auth.signInButton")}
                </button>
              </form>
            ) : (
              <form noValidate onSubmit={handleRegister}>
                <p className="text-muted small mb-3">
                  <i className="bi bi-shield-lock me-1" style={{ color: '#0f766e' }} aria-hidden="true"></i>
                  {registerCopy.intro}
                </p>

                <div
                  data-testid="register-step-indicator"
                  className="d-flex align-items-center justify-content-between rounded-3 px-3 py-2 mb-3 small fw-semibold"
                  style={{ backgroundColor: '#f0fdfa', color: '#0f766e', border: '1px solid #ccfbf1' }}
                >
                  <span>{registerStep === 1 ? registerCopy.step1Title : registerCopy.step2Title}</span>
                  <span>{registerStep} / 2</span>
                </div>

                {registerStep === 1 ? (
                  <>
                    <div className="row g-3 mb-3">
                      <div className="col-sm-6">
                        <label htmlFor="regFirst" className="form-label fw-semibold small text-secondary mb-1">
                          {t("auth.firstName")} *
                        </label>
                        <input
                          type="text"
                          required
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regFirst"
                          placeholder={t("auth.firstName")}
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="col-sm-6">
                        <label htmlFor="regLast" className="form-label fw-semibold small text-secondary mb-1">
                          {t("auth.lastName")} *
                        </label>
                        <input
                          type="text"
                          required
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regLast"
                          placeholder={t("auth.lastName")}
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label htmlFor="regUser" className="form-label fw-semibold small text-secondary mb-1">
                        {t("auth.username")} *
                      </label>
                      <input
                        type="text"
                        required
                        className="form-control"
                        style={{ minHeight: '44px' }}
                        id="regUser"
                        placeholder={t("auth.username")}
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      data-testid="register-next-step"
                      onClick={handleNextRegisterStep}
                      className="btn w-full fw-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
                    >
                      {registerCopy.nextStepBtn}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mb-3">
                      <label htmlFor="regEmail" className="form-label fw-semibold small text-secondary mb-1">
                        {t("auth.email")} *
                      </label>
                      <input
                        type="email"
                        required
                        className="form-control"
                        style={{ minHeight: '44px' }}
                        id="regEmail"
                        placeholder={t("auth.email")}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="regPass" className="form-label fw-semibold small text-secondary mb-1">
                        {t("auth.password")} *
                      </label>
                      <input
                        type="password"
                        required
                        className="form-control"
                        style={{ minHeight: '44px' }}
                        id="regPass"
                        placeholder={t("auth.password")}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                      <div
                        className={`small mt-1 ${password.length >= 8 ? 'text-success fw-semibold' : 'text-muted'}`}
                        data-testid="register-password-hint"
                      >
                        {registerCopy.passwordHint} ({password.length}/8)
                      </div>
                    </div>
                    <div className="row g-2 mb-3">
                      <div className="col-sm-6">
                        <label htmlFor="regDob" className="form-label fw-semibold small text-secondary mb-1">
                          {registerCopy.dobLabel}
                        </label>
                        <input
                          type="date"
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regDob"
                          value={dateOfBirth}
                          onChange={e => setDateOfBirth(e.target.value)}
                        />
                      </div>
                      <div className="col-sm-6">
                        <label htmlFor="regPhone" className="form-label fw-semibold small text-secondary mb-1">
                          {registerCopy.phoneLabel}
                        </label>
                        <input
                          type="tel"
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regPhone"
                          placeholder="+45 12 34 56 78"
                          value={phoneNumber}
                          onChange={e => setPhoneNumber(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="row g-2 mb-4">
                      <div className="col-12 col-sm-7">
                        <label htmlFor="regAddress" className="form-label fw-semibold small text-secondary mb-1">
                          {registerCopy.addressLabel}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regAddress"
                          placeholder={registerCopy.addressPlaceholder}
                          value={homeAddress}
                          onChange={e => setHomeAddress(e.target.value)}
                        />
                      </div>
                      <div className="col-12 col-sm-5">
                        <label htmlFor="regPostal" className="form-label fw-semibold small text-secondary mb-1">
                          {registerCopy.postalLabel}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          style={{ minHeight: '44px' }}
                          id="regPostal"
                          placeholder={registerCopy.postalPlaceholder}
                          value={postalCode}
                          onChange={e => setPostalCode(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        data-testid="register-prev-step"
                        onClick={() => { setRegisterStep(1); setError(""); }}
                        className="btn btn-outline-secondary fw-semibold px-3"
                        style={{ minHeight: '44px', borderRadius: '0.75rem' }}
                      >
                        {registerCopy.prevStepBtn}
                      </button>
                      <button
                        className="btn flex-grow-1 fw-bold text-white"
                        style={{ backgroundColor: '#0f766e', borderColor: '#0f766e', minHeight: '44px', borderRadius: '0.75rem' }}
                        type="submit"
                        disabled={loading}
                      >
                        {loading ? t("auth.creatingAccount") : t("auth.createAccountButton")}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
