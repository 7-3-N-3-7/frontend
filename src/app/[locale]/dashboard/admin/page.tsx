"use client";

import React, { useState, useEffect, useCallback } from "react";

const SUPPORTED_LOCALES = [
  { code: "da", label: "Dansk (da)" },
  { code: "en", label: "English (en)" },
  { code: "de", label: "Deutsch (de)" },
  { code: "es", label: "Español (es)" },
  { code: "fr", label: "Français (fr)" },
];

export default function AdminI18nDictionaryPage() {
  const [selectedLocale, setSelectedLocale] = useState("da");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const flattenObject = (obj: any, prefix = ""): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!obj || typeof obj !== "object") return out;
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        Object.assign(out, flattenObject(v, fullKey));
      } else {
        out[fullKey] = String(v ?? "");
      }
    }
    return out;
  };

  const loadDictionary = useCallback(async (locale: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backend/i18n/${locale}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTranslations(flattenObject(data));
      } else {
        setTranslations({});
      }
    } catch {
      setTranslations({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDictionary(selectedLocale);
  }, [selectedLocale, loadDictionary]);

  const handleUpdateKey = async (key: string, value: string) => {
    setTranslations((prev) => ({ ...prev, [key]: value }));
    const res = await fetch(
      `/api/backend/i18n/${selectedLocale}/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      }
    );
    if (res.ok) {
      setStatusMessage(
        `Nøglen "${key}" blev opdateret i MongoDB (${selectedLocale.toUpperCase()}).`
      );
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    await handleUpdateKey(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
  };

  const entries = Object.entries(translations).filter(
    ([k, v]) =>
      k.toLowerCase().includes(searchFilter.toLowerCase()) ||
      String(v).toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="d-flex flex-column gap-4">
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-body p-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-1 mb-2">
              Admin-Only • MongoDB i18n Dictionary (Q14)
            </span>
            <h1 className="h3 fw-bold text-dark mb-1">
              Live MongoDB Sprog- &amp; Oversættelses-Editor
            </h1>
            <p className="text-muted small mb-0">
              Alle nøgler læses og skrives direkte til MongoDB (`i18n_dictionaries`) via Spring Boot.
            </p>
          </div>

          <div className="btn-group">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc.code}
                type="button"
                onClick={() => setSelectedLocale(loc.code)}
                className={`btn btn-sm ${
                  selectedLocale === loc.code ? "btn-dark" : "btn-outline-secondary"
                }`}
              >
                {loc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="alert alert-success rounded-4 shadow-xs mb-0">
          {statusMessage}
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card border-0 shadow-xs rounded-4 bg-white">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3">Tilføj / Overskriv Nøgle</h5>
              <form onSubmit={handleAddKey}>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Nøgle (Key)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="f.eks. landing.hero.titleLine1"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">
                    Værdi ({selectedLocale.toUpperCase()})
                  </label>
                  <textarea
                    rows={3}
                    className="form-control"
                    required
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary w-100 rounded-pill py-2 fw-semibold"
                >
                  Gem i MongoDB ({selectedLocale.toUpperCase()})
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card border-0 shadow-xs rounded-4 bg-white">
            <div className="card-body p-4">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <h5 className="fw-bold mb-0">
                  MongoDB Sprognøgler ({entries.length})
                </h5>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  style={{ maxWidth: "260px" }}
                  placeholder="Filtrér nøgler eller tekst..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="text-center py-4 text-muted">
                  Indlæser fra MongoDB...
                </div>
              ) : entries.length === 0 ? (
                <div className="text-muted small py-3">
                  Ingen nøgler fundet i MongoDB for [{selectedLocale}]. Tilføj en nøgle til venstre for at oprette dokumentet.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {entries.map(([key, val]) => (
                    <div
                      key={key}
                      className="p-2.5 rounded-3 border bg-light bg-opacity-50 row g-2 align-items-center mx-0"
                    >
                      <div className="col-md-5 font-monospace small fw-semibold text-primary text-break">
                        {key}
                      </div>
                      <div className="col-md-7 d-flex gap-2">
                        <input
                          type="text"
                          className="form-control form-control-sm bg-white"
                          value={String(val)}
                          onChange={(e) =>
                            setTranslations((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateKey(key, String(translations[key]))}
                          className="btn btn-sm btn-dark rounded-pill px-3"
                        >
                          Gem
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
