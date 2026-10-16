"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/routing";
import { useI18nCache } from "@/components/CachedI18nProvider";

interface LocaleSummary {
  id?: string;
  locale: string;
  displayName: string;
  flag: string;
  published: boolean;
  updatedAt?: string | null;
  translatedCount: number;
  totalReferenceKeys: number;
  totalKeysInDoc: number;
  missingCount: number;
  completionPct: number;
}

const DEFAULT_FALLBACK_LOCALES: LocaleSummary[] = [
  {
    locale: "da",
    displayName: "Dansk",
    flag: "🇩🇰",
    published: true,
    translatedCount: 0,
    totalReferenceKeys: 0,
    totalKeysInDoc: 0,
    missingCount: 0,
    completionPct: 100,
  },
  {
    locale: "en",
    displayName: "English",
    flag: "🇬🇧",
    published: true,
    translatedCount: 0,
    totalReferenceKeys: 0,
    totalKeysInDoc: 0,
    missingCount: 0,
    completionPct: 100,
  },
  {
    locale: "de",
    displayName: "Deutsch",
    flag: "🇩🇪",
    published: true,
    translatedCount: 0,
    totalReferenceKeys: 0,
    totalKeysInDoc: 0,
    missingCount: 0,
    completionPct: 100,
  },
  {
    locale: "es",
    displayName: "Español",
    flag: "🇪🇸",
    published: true,
    translatedCount: 0,
    totalReferenceKeys: 0,
    totalKeysInDoc: 0,
    missingCount: 0,
    completionPct: 100,
  },
  {
    locale: "fr",
    displayName: "Français",
    flag: "🇫🇷",
    published: true,
    translatedCount: 0,
    totalReferenceKeys: 0,
    totalKeysInDoc: 0,
    missingCount: 0,
    completionPct: 100,
  },
];

const QUICK_NEW_LOCALE_PRESETS = [
  { code: "sv", name: "Svenska", flag: "🇸🇪" },
  { code: "no", name: "Norsk", flag: "🇳🇴" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "fi", name: "Suomi", flag: "🇫🇮" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "is", name: "Íslenska", flag: "🇮🇸" },
];

export default function AdminI18nDictionaryPage() {
  const router = useRouter();
  const i18nCache = useI18nCache();

  const [locales, setLocales] = useState<LocaleSummary[]>(DEFAULT_FALLBACK_LOCALES);
  const [selectedLocale, setSelectedLocale] = useState("da");
  const [referenceLocale, setReferenceLocale] = useState("da");

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [referenceTranslations, setReferenceTranslations] = useState<Record<string, string>>({});
  const [rawMongoDocument, setRawMongoDocument] = useState<any>(null);
  const [rawJsonEditorText, setRawJsonEditorText] = useState("");

  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MISSING" | "TRANSLATED">("ALL");
  const [sectionFilter, setSectionFilter] = useState<string>("ALL");

  const [activeStudioTab, setActiveStudioTab] = useState<"SIDE_BY_SIDE" | "MONGODB_RAW" | "LIVE_PREVIEW">("SIDE_BY_SIDE");
  const [showSplitPreview, setShowSplitPreview] = useState(true);
  const [previewRoute, setPreviewRoute] = useState<"/dashboard/personal" | "/dashboard/therapist" | "/">("/dashboard/personal");
  const [previewHighlightMissing, setPreviewHighlightMissing] = useState(true);
  const [iframeRefreshKey, setIframeRefreshKey] = useState(1);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create New Draft Locale Modal State
  const [showCreateLocaleModal, setShowCreateLocaleModal] = useState(false);
  const [newLocaleCode, setNewLocaleCode] = useState("sv");
  const [newLocaleName, setNewLocaleName] = useState("Svenska");
  const [newLocaleFlag, setNewLocaleFlag] = useState("🇸🇪");
  const [newLocaleCloneFrom, setNewLocaleCloneFrom] = useState("da");
  const [newLocaleCopyValues, setNewLocaleCopyValues] = useState(false);
  const [newLocalePublishImmediately, setNewLocalePublishImmediately] = useState(false);

  const flattenObject = useCallback((obj: any, prefix = ""): Record<string, string> => {
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
  }, []);

  const syncPreviewCookie = useCallback((enable: boolean) => {
    if (typeof document === "undefined") return;
    document.cookie = `i18n_preview_mode=${enable ? "1" : "0"}; path=/; max-age=${enable ? 86400 : 0}`;
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const hasCookie = document.cookie
        .split(";")
        .some((c) => c.trim().startsWith("i18n_preview_mode=1"));
      if (hasCookie) {
        setPreviewHighlightMissing(true);
      } else {
        syncPreviewCookie(true);
      }
    }
  }, [syncPreviewCookie]);

  const loadLocalesSummary = useCallback(async (refCode = referenceLocale) => {
    try {
      const res = await fetch(`/api/backend/i18n/locales?ref=${encodeURIComponent(refCode)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          setLocales(list);
        }
      }
    } catch {
      // keep fallback list
    }
  }, [referenceLocale]);

  const loadDictionary = useCallback(
    async (locale: string, refLoc: string) => {
      setLoading(true);
      try {
        const [targetDocRes, targetDictRes, refDictRes] = await Promise.all([
          fetch(`/api/backend/i18n/document/${locale}`, { cache: "no-store" }),
          fetch(`/api/backend/i18n/${locale}`, { cache: "no-store" }),
          fetch(`/api/backend/i18n/${refLoc}`, { cache: "no-store" }),
        ]);

        if (targetDocRes.ok) {
          const rawDoc = await targetDocRes.json();
          setRawMongoDocument(rawDoc);
          setRawJsonEditorText(JSON.stringify(rawDoc.translations || {}, null, 2));
          setTranslations(flattenObject(rawDoc.translations || {}));
        } else if (targetDictRes.ok) {
          const isFallback = targetDictRes.headers.get("X-Locale-Fallback") != null;
          const data = isFallback ? {} : await targetDictRes.json();
          setRawMongoDocument({
            locale,
            published: false,
            translations: data,
          });
          setRawJsonEditorText(JSON.stringify(data, null, 2));
          setTranslations(flattenObject(data));
        } else {
          setRawMongoDocument({ locale, published: false, translations: {} });
          setRawJsonEditorText("{}");
          setTranslations({});
        }

        if (refDictRes.ok) {
          const refData = await refDictRes.json();
          setReferenceTranslations(flattenObject(refData));
        } else {
          setReferenceTranslations({});
        }
      } catch {
        setTranslations({});
      } finally {
        setLoading(false);
      }
    },
    [flattenObject]
  );

  useEffect(() => {
    loadLocalesSummary(referenceLocale);
    loadDictionary(selectedLocale, referenceLocale);
  }, [selectedLocale, referenceLocale, loadLocalesSummary, loadDictionary]);

  const notifyStatus = (msg: string) => {
    i18nCache?.invalidateI18nCache();
    setErrorMessage(null);
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const notifyError = (msg: string) => {
    setStatusMessage(null);
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 6000);
  };

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
      notifyStatus(
        `Nøglen "${key}" blev opdateret i MongoDB (${selectedLocale.toUpperCase()}).`
      );
      await loadLocalesSummary(referenceLocale);
      await loadDictionary(selectedLocale, referenceLocale);
      setIframeRefreshKey((k) => k + 1);
    } else {
      notifyError(`Kunne ikke gemme nøglen "${key}" i MongoDB.`);
    }
  };

  const handleDeleteKey = async (key: string) => {
    const res = await fetch(
      `/api/backend/i18n/${selectedLocale}/${encodeURIComponent(key)}`,
      {
        method: "DELETE",
      }
    );
    if (res.ok) {
      notifyStatus(
        `Nøglen "${key}" blev fjernet fra MongoDB (${selectedLocale.toUpperCase()}).`
      );
      await loadLocalesSummary(referenceLocale);
      await loadDictionary(selectedLocale, referenceLocale);
      setIframeRefreshKey((k) => k + 1);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    await handleUpdateKey(newKey.trim(), newValue);
    setNewKey("");
    setNewValue("");
  };

  const handleCreateNewLocale = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newLocaleCode.trim().toLowerCase();
    if (!code) return;

    const res = await fetch("/api/backend/i18n/locales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: code,
        displayName: newLocaleName.trim() || code.toUpperCase(),
        flag: newLocaleFlag.trim() || "🌐",
        published: newLocalePublishImmediately,
        cloneFromLocale: newLocaleCloneFrom,
        copyValues: newLocaleCopyValues,
      }),
    });

    if (res.ok) {
      setShowCreateLocaleModal(false);
      await loadLocalesSummary(referenceLocale);
      setSelectedLocale(code);
      await loadDictionary(code, referenceLocale);
      setIframeRefreshKey((k) => k + 1);
      notifyStatus(
        `Sproget "${newLocaleName} (${code.toUpperCase()})" er oprettet i MongoDB som ${
          newLocalePublishImmediately ? "Udgivet (Published)" : "Kladde (Draft)"
        }.`
      );
    } else {
      notifyError("Kunne ikke oprette det nye sprog i MongoDB.");
    }
  };

  const handleToggleLocalePublished = async (loc: LocaleSummary) => {
    const nextPublished = !loc.published;
    const res = await fetch(`/api/backend/i18n/locales/${loc.locale}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        published: nextPublished,
        displayName: loc.displayName,
        flag: loc.flag,
      }),
    });
    if (res.ok) {
      await loadLocalesSummary(referenceLocale);
      await loadDictionary(selectedLocale, referenceLocale);
      notifyStatus(
        nextPublished
          ? `Sproget ${loc.displayName} (${loc.locale.toUpperCase()}) er nu UDGIVET og synligt i sprogvælgeren for alle brugere.`
          : `Sproget ${loc.displayName} (${loc.locale.toUpperCase()}) er nu sat som KLADDE (kun synligt i Admin Preview).`
      );
    }
  };

  const handleCloneMissingFromReference = async () => {
    const res = await fetch("/api/backend/i18n/locales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: selectedLocale,
        cloneFromLocale: referenceLocale,
        copyValues: true,
      }),
    });
    if (res.ok) {
      await loadLocalesSummary(referenceLocale);
      await loadDictionary(selectedLocale, referenceLocale);
      setIframeRefreshKey((k) => k + 1);
      notifyStatus(
        `Alle manglende nøgler i ${selectedLocale.toUpperCase()} blev udfyldt med tekst fra ${referenceLocale.toUpperCase()} i MongoDB.`
      );
    }
  };

  const handleSaveRawJsonDocument = async () => {
    try {
      const parsed = JSON.parse(rawJsonEditorText);
      const res = await fetch(`/api/backend/i18n/document/${selectedLocale}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: parsed }),
      });
      if (res.ok) {
        await loadLocalesSummary(referenceLocale);
        await loadDictionary(selectedLocale, referenceLocale);
        setIframeRefreshKey((k) => k + 1);
        notifyStatus(
          `Råt MongoDB JSON-dokument for ${selectedLocale.toUpperCase()} blev gemt direkte i i18n_dictionaries.`
        );
      } else {
        notifyError("Kunne ikke gemme JSON-dokumentet i MongoDB.");
      }
    } catch (err: any) {
      notifyError(`Ugyldig JSON-syntaks: ${err?.message || "Tjek kommaer og anførselstegn"}`);
    }
  };

  const handleOpenFullSitePreview = (targetPath: string) => {
    syncPreviewCookie(true);
    setPreviewHighlightMissing(true);
    router.push(targetPath as any, { locale: selectedLocale as any });
  };

  // Merge all keys from both referenceLocale and selectedLocale so missing translations are clearly visible
  const combinedRows = useMemo(() => {
    const allKeySet = new Set<string>([
      ...Object.keys(referenceTranslations),
      ...Object.keys(translations),
    ]);
    const sortedKeys = Array.from(allKeySet).sort((a, b) => a.localeCompare(b));
    return sortedKeys.map((key) => {
      const refValue = referenceTranslations[key] ?? "";
      const targetValue = translations[key] ?? "";
      const isMissing = !targetValue || targetValue.trim() === "";
      const section = key.includes(".") ? key.split(".")[0] : "custom";
      return {
        key,
        section,
        refValue,
        targetValue,
        isMissing,
      };
    });
  }, [referenceTranslations, translations]);

  const availableSections = useMemo(() => {
    const s = new Set<string>();
    for (const row of combinedRows) {
      s.add(row.section);
    }
    return Array.from(s).sort();
  }, [combinedRows]);

  const filteredRows = useMemo(() => {
    return combinedRows.filter((row) => {
      if (statusFilter === "MISSING" && !row.isMissing) return false;
      if (statusFilter === "TRANSLATED" && row.isMissing) return false;
      if (sectionFilter !== "ALL" && row.section !== sectionFilter) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        row.key.toLowerCase().includes(q) ||
        String(row.targetValue).toLowerCase().includes(q) ||
        String(row.refValue).toLowerCase().includes(q)
      );
    });
  }, [combinedRows, statusFilter, sectionFilter, searchFilter]);

  const currentLocaleSummary = useMemo(() => {
    return (
      locales.find((l) => l.locale === selectedLocale) || {
        locale: selectedLocale,
        displayName: selectedLocale.toUpperCase(),
        flag: "🌐",
        published: true,
        translatedCount: combinedRows.filter((r) => !r.isMissing).length,
        totalReferenceKeys: combinedRows.length,
        totalKeysInDoc: Object.keys(translations).length,
        missingCount: combinedRows.filter((r) => r.isMissing).length,
        completionPct:
          combinedRows.length > 0
            ? Math.round(
                (combinedRows.filter((r) => !r.isMissing).length * 100) /
                  combinedRows.length
              )
            : 100,
      }
    );
  }, [locales, selectedLocale, combinedRows, translations]);

  const missingCount = useMemo(
    () => combinedRows.filter((r) => r.isMissing).length,
    [combinedRows]
  );

  return (
    <div className="d-flex flex-column gap-4">
      {/* TOP HEADER & LOCALE CARDS */}
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-body p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
            <div>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-1">
                  Admin-Only • MongoDB i18n Dictionary (Q14)
                </span>
                <span className="badge bg-dark text-white rounded-pill px-3 py-1 font-monospace">
                  db.i18n_dictionaries
                </span>
                <span
                  className={`badge rounded-pill px-3 py-1 ${
                    currentLocaleSummary.published
                      ? "bg-success-subtle text-success border border-success-subtle"
                      : "bg-warning-subtle text-dark border border-warning"
                  }`}
                >
                  {currentLocaleSummary.published
                    ? "✓ Udgivet i Sprogvælger (Published)"
                    : "📝 Kladde-tilstand (Kun synlig i Preview)"}
                </span>
              </div>
              <h1 className="h3 fw-bold text-dark mb-1">
                Live MongoDB Sprog- &amp; Oversættelses-Editor
              </h1>
              <p className="text-muted small mb-0">
                Undersøg oversættelser i MongoDB, sammenlign side-om-side med Dansk/Engelsk, og forhåndsvis hjemmesiden før et nyt sprog udgives.
              </p>
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSplitPreview((v) => !v)}
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  showSplitPreview ? "btn-dark" : "btn-outline-dark"
                }`}
              >
                <i className="bi bi-layout-split me-1"></i>
                {showSplitPreview ? "Skjul Split-Screen Preview" : "Vis Split-Screen Preview"}
              </button>

              <button
                type="button"
                onClick={() => handleOpenFullSitePreview("/dashboard/personal")}
                className="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold"
              >
                <i className="bi bi-eye me-1"></i>
                Forhåndsvis på Siden ({selectedLocale.toUpperCase()}) ↗
              </button>

              <button
                type="button"
                onClick={() => setShowCreateLocaleModal(true)}
                className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold"
              >
                <i className="bi bi-plus-lg me-1"></i>
                Opret Nyt Sprog (Kladde)
              </button>
            </div>
          </div>

          {/* LOCALE SELECTOR PILLS WITH PROGRESS & DRAFT BADGES */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 pt-3 border-top">
            <div className="d-flex flex-wrap align-items-center gap-2">
              {locales.map((loc) => {
                const isSelected = selectedLocale === loc.locale;
                return (
                  <button
                    key={loc.locale}
                    type="button"
                    onClick={() => setSelectedLocale(loc.locale)}
                    className={`btn btn-sm rounded-3 px-3 py-2 d-inline-flex align-items-center gap-2 ${
                      isSelected
                        ? "btn-dark shadow-xs"
                        : "btn-outline-secondary bg-white text-dark"
                    }`}
                  >
                    <span>{loc.flag}</span>
                    <span className="fw-semibold">
                      {loc.displayName} ({loc.locale})
                    </span>
                    <span
                      className={`badge rounded-pill ${
                        loc.completionPct >= 100
                          ? "bg-success text-white"
                          : loc.completionPct >= 50
                          ? "bg-info text-dark"
                          : "bg-warning text-dark"
                      }`}
                      style={{ fontSize: "0.68rem" }}
                    >
                      {loc.completionPct}%
                    </span>
                    {!loc.published && (
                      <span
                        className="badge bg-warning text-dark"
                        style={{ fontSize: "0.65rem" }}
                      >
                        Kladde
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* CURRENT LOCALE COMPLETION & PUBLISH TOGGLE */}
            <div className="d-flex flex-wrap align-items-center gap-3 bg-light rounded-3 px-3 py-2 border">
              <div>
                <div className="small fw-bold text-dark">
                  {currentLocaleSummary.flag} {currentLocaleSummary.displayName} (
                  {selectedLocale.toUpperCase()}):{" "}
                  { combinedRows.length - missingCount } / { combinedRows.length } nøgler oversat
                </div>
                <div className="progress mt-1" style={{ height: "6px", width: "180px" }}>
                  <div
                    className={`progress-bar ${
                      missingCount === 0 ? "bg-success" : "bg-warning"
                    }`}
                    style={{
                      width: `${
                        combinedRows.length > 0
                          ? Math.round(
                              ((combinedRows.length - missingCount) * 100) /
                                combinedRows.length
                            )
                          : 100
                      }%`,
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleToggleLocalePublished(currentLocaleSummary)}
                className={`btn btn-sm rounded-pill px-3 fw-semibold ${
                  currentLocaleSummary.published
                    ? "btn-outline-warning text-dark"
                    : "btn-success"
                }`}
              >
                {currentLocaleSummary.published
                  ? "Sæt som Kladde (Skjul i menu)"
                  : "✓ Publicér Sprog til Brugere"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS / ERROR BANNERS */}
      {statusMessage && (
        <div className="alert alert-success rounded-4 shadow-xs mb-0 d-flex justify-content-between align-items-center">
          <span>{statusMessage}</span>
          <button
            type="button"
            className="btn-close"
            onClick={() => setStatusMessage(null)}
          />
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger rounded-4 shadow-xs mb-0 d-flex justify-content-between align-items-center">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="btn-close"
            onClick={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* CREATE NEW DRAFT LOCALE MODAL */}
      {showCreateLocaleModal && (
        <div className="card border-primary border-2 shadow-sm rounded-4 bg-white">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="fw-bold mb-1">
                  Opret Nyt Sprog i MongoDB (Før Udgivelse)
                </h5>
                <p className="text-muted small mb-0">
                  Opret sproget som <strong>Kladde (Draft)</strong>, oversæt nøglerne og test hvordan hjemmesiden ser ud i Split-Screen Preview, før du slår det til for brugerne.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateLocaleModal(false)}
                className="btn btn-sm btn-outline-secondary rounded-pill px-3"
              >
                Luk
              </button>
            </div>

            <div className="mb-3">
              <span className="small fw-semibold text-muted me-2">Hurtig-valg:</span>
              <div className="d-inline-flex flex-wrap gap-1">
                {QUICK_NEW_LOCALE_PRESETS.map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => {
                      setNewLocaleCode(preset.code);
                      setNewLocaleName(preset.name);
                      setNewLocaleFlag(preset.flag);
                    }}
                    className={`btn btn-sm rounded-pill px-2.5 py-1 ${
                      newLocaleCode === preset.code
                        ? "btn-primary"
                        : "btn-light border"
                    }`}
                    style={{ fontSize: "0.78rem" }}
                  >
                    {preset.flag} {preset.name} ({preset.code})
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateNewLocale} className="row g-3 align-items-end">
              <div className="col-md-2">
                <label className="form-label small fw-semibold">Sprogkode (ISO)</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="f.eks. sv"
                  value={newLocaleCode}
                  onChange={(e) => setNewLocaleCode(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold">Visningsnavn</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="f.eks. Svenska"
                  value={newLocaleName}
                  onChange={(e) => setNewLocaleName(e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-semibold">Flag-ikon</label>
                <input
                  type="text"
                  className="form-control"
                  value={newLocaleFlag}
                  onChange={(e) => setNewLocaleFlag(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-semibold">Start-indhold i MongoDB</label>
                <select
                  className="form-select"
                  value={newLocaleCopyValues ? `COPY_${newLocaleCloneFrom}` : "EMPTY"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "EMPTY") {
                      setNewLocaleCopyValues(false);
                    } else {
                      setNewLocaleCopyValues(true);
                      setNewLocaleCloneFrom(val.replace("COPY_", ""));
                    }
                  }}
                >
                  <option value="EMPTY">
                    Tomt sprog (vis ⚠️ ved manglende nøgler i Preview)
                  </option>
                  <option value="COPY_da">Kopiér danske tekster som udgangspunkt</option>
                  <option value="COPY_en">Kopiér engelske tekster som udgangspunkt</option>
                </select>
              </div>
              <div className="col-md-2">
                <button
                  type="submit"
                  className="btn btn-primary w-100 rounded-pill py-2 fw-semibold"
                >
                  + Opret i MongoDB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE: LEFT ADD/CLONE + STUDIO TABS + OPTIONAL SPLIT-SCREEN LIVE PREVIEW */}
      <div className="row g-4">
        {/* LEFT COLUMN: ADD KEY & QUICK MONGODB ACTIONS */}
        <div className="col-lg-3">
          <div className="card border-0 shadow-xs rounded-4 bg-white mb-4">
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
                  <div className="form-text" style={{ fontSize: "0.72rem" }}>
                    Brug punktum (f.eks. <code>portal.brandTitle</code>) for at gemme i MongoDBs indlejrede JSON-træ.
                  </div>
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

          {/* MONGODB HELPER CARD */}
          <div className="card border-0 shadow-xs rounded-4 bg-white">
            <div className="card-body p-4">
              <h6 className="fw-bold mb-2">
                <i className="bi bi-database-check me-1 text-primary"></i>
                MongoDB Værktøjer
              </h6>
              <p className="text-muted small mb-3">
                Sammenligner aktuelt <strong>{selectedLocale.toUpperCase()}</strong> med referencesproget{" "}
                <strong>{referenceLocale.toUpperCase()}</strong>.
              </p>

              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  Referencesprog (Venstre kolonne)
                </label>
                <select
                  className="form-select form-select-sm"
                  value={referenceLocale}
                  onChange={(e) => setReferenceLocale(e.target.value)}
                >
                  <option value="da">🇩🇰 Dansk (da)</option>
                  <option value="en">🇬🇧 English (en)</option>
                </select>
              </div>

              {missingCount > 0 && (
                <div className="p-3 rounded-3 bg-warning-subtle border border-warning mb-3">
                  <div className="small fw-bold text-dark mb-1">
                    ⚠️ {missingCount} manglende nøgler i {selectedLocale.toUpperCase()}
                  </div>
                  <div className="small text-secondary mb-2" style={{ fontSize: "0.76rem" }}>
                    Du kan filtrere på dem i tabellen eller udfylde dem automatisk fra {referenceLocale.toUpperCase()}.
                  </div>
                  <div className="d-flex flex-column gap-1">
                    <button
                      type="button"
                      onClick={() => setStatusFilter("MISSING")}
                      className="btn btn-sm btn-warning rounded-pill fw-semibold"
                    >
                      Vis kun de {missingCount} manglende nøgler
                    </button>
                    <button
                      type="button"
                      onClick={handleCloneMissingFromReference}
                      className="btn btn-sm btn-outline-dark rounded-pill fw-semibold"
                    >
                      Udfyld manglende fra {referenceLocale.toUpperCase()}
                    </button>
                  </div>
                </div>
              )}

              <div className="form-check form-switch mb-2">
                <input
                  id="preview-highlight-switch"
                  className="form-check-input"
                  type="checkbox"
                  checked={previewHighlightMissing}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setPreviewHighlightMissing(next);
                    syncPreviewCookie(next);
                    setIframeRefreshKey((k) => k + 1);
                  }}
                />
                <label
                  htmlFor="preview-highlight-switch"
                  className="form-check-label small fw-semibold"
                >
                  Fremhæv manglende nøgler med ⚠️ i Preview
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER / RIGHT AREA: TRANSLATION TABLE + MONGODB INSPECTOR + SPLIT PREVIEW */}
        <div className={showSplitPreview ? "col-lg-5" : "col-lg-9"}>
          <div className="card border-0 shadow-xs rounded-4 bg-white h-100">
            <div className="card-body p-4">
              {/* STUDIO VIEW TABS + FILTERS */}
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 pb-3 border-bottom">
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    onClick={() => setActiveStudioTab("SIDE_BY_SIDE")}
                    className={`btn ${
                      activeStudioTab === "SIDE_BY_SIDE"
                        ? "btn-dark"
                        : "btn-outline-secondary"
                    }`}
                  >
                    <i className="bi bi-columns-gap me-1"></i>
                    MongoDB Sprognøgler ({filteredRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStudioTab("MONGODB_RAW")}
                    className={`btn ${
                      activeStudioTab === "MONGODB_RAW"
                        ? "btn-dark"
                        : "btn-outline-secondary"
                    }`}
                  >
                    <i className="bi bi-filetype-json me-1"></i>
                    Rå MongoDB JSON-Inspektør
                  </button>
                </div>

                {activeStudioTab === "SIDE_BY_SIDE" && (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: "auto" }}
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                      <option value="ALL">Alle ({combinedRows.length})</option>
                      <option value="MISSING">⚠️ Kun manglende ({missingCount})</option>
                      <option value="TRANSLATED">
                        ✓ Kun oversatte ({combinedRows.length - missingCount})
                      </option>
                    </select>

                    <select
                      className="form-select form-select-sm"
                      style={{ width: "auto" }}
                      value={sectionFilter}
                      onChange={(e) => setSectionFilter(e.target.value)}
                    >
                      <option value="ALL">Alle sektioner</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}.*
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ maxWidth: "210px" }}
                      placeholder="Filtrér nøgler eller tekst..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* TAB 1: SIDE-BY-SIDE COMPARISON & INLINE MONGODB EDITOR */}
              {activeStudioTab === "SIDE_BY_SIDE" && (
                <>
                  {loading ? (
                    <div className="text-center py-4 text-muted">
                      Indlæser fra MongoDB...
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="text-muted small py-3">
                      Ingen nøgler matcher dit filter for [{selectedLocale}].
                    </div>
                  ) : (
                    <div
                      className="d-flex flex-column gap-2 pe-1"
                      style={{ maxHeight: "680px", overflowY: "auto" }}
                    >
                      {filteredRows.map((row) => (
                        <div
                          key={row.key}
                          className={`p-3 rounded-3 border row g-2 align-items-center mx-0 ${
                            row.isMissing
                              ? "bg-warning-subtle border-warning"
                              : "bg-light bg-opacity-50"
                          }`}
                        >
                          <div className="col-12 d-flex justify-content-between align-items-center">
                            <span className="font-monospace small fw-semibold text-primary text-break">
                              {row.key}
                            </span>
                            <div className="d-flex align-items-center gap-2">
                              {row.isMissing ? (
                                <span
                                  className="badge bg-warning text-dark"
                                  style={{ fontSize: "0.68rem" }}
                                >
                                  ⚠️ Mangler i {selectedLocale.toUpperCase()}
                                </span>
                              ) : (
                                <span
                                  className="badge bg-success-subtle text-success"
                                  style={{ fontSize: "0.68rem" }}
                                >
                                  ✓ Gemt i MongoDB
                                </span>
                              )}
                              <button
                                type="button"
                                title="Indlæs nøgle i formularen til venstre"
                                onClick={() => {
                                  setNewKey(row.key);
                                  setNewValue(row.targetValue || row.refValue || "");
                                }}
                                className="btn btn-link btn-sm p-0 text-secondary text-decoration-none"
                                style={{ fontSize: "0.75rem" }}
                              >
                                Kopiér til formular
                              </button>
                            </div>
                          </div>

                          {/* Reference Language Value */}
                          {selectedLocale !== referenceLocale && row.refValue && (
                            <div className="col-12">
                              <div
                                className="small text-muted bg-white rounded-2 px-2.5 py-1 border d-flex justify-content-between align-items-center gap-2"
                                style={{ fontSize: "0.76rem" }}
                              >
                                <span>
                                  <strong className="text-uppercase me-1">
                                    {referenceLocale}:
                                  </strong>
                                  {row.refValue}
                                </span>
                                {row.isMissing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTranslations((prev) => ({
                                        ...prev,
                                        [row.key]: row.refValue,
                                      }))
                                    }
                                    className="btn btn-link btn-sm p-0 text-primary text-decoration-none flex-shrink-0"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    Indsæt kladde
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Target Language Editable Input */}
                          <div className="col-12 d-flex gap-2">
                            <input
                              type="text"
                              className="form-control form-control-sm bg-white"
                              placeholder={
                                row.isMissing
                                  ? `Skriv ${selectedLocale.toUpperCase()}-oversættelse her...`
                                  : ""
                              }
                              value={String(translations[row.key] ?? "")}
                              onChange={(e) =>
                                setTranslations((prev) => ({
                                  ...prev,
                                  [row.key]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateKey(
                                  row.key,
                                  String(translations[row.key] ?? "")
                                )
                              }
                              className="btn btn-sm btn-dark rounded-pill px-3"
                            >
                              Gem
                            </button>
                            {!row.isMissing && (
                              <button
                                type="button"
                                title="Slet nøgle fra dette sprog i MongoDB"
                                onClick={() => handleDeleteKey(row.key)}
                                className="btn btn-sm btn-outline-danger rounded-pill px-2.5"
                              >
                                <i className="bi bi-trash"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: RAW MONGODB DOCUMENT INSPECTOR & JSON EDITOR */}
              {activeStudioTab === "MONGODB_RAW" && (
                <div className="d-flex flex-column gap-3">
                  <div className="p-3 rounded-3 bg-light border d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                      <div className="small fw-bold text-dark">
                        MongoDB Kollektion: <code>i18n_dictionaries</code> • Dokument{" "}
                        <code>locale: &quot;{selectedLocale}&quot;</code>
                      </div>
                      <div className="small text-muted" style={{ fontSize: "0.75rem" }}>
                        Document ID: <code>{rawMongoDocument?.id || "(endnu ikke gemt)"}</code>{" "}
                        • Sidst opdateret:{" "}
                        <code>{rawMongoDocument?.updatedAt || "N/A"}</code>
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          loadDictionary(selectedLocale, referenceLocale)
                        }
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                      >
                        Genindlæs fra MongoDB
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveRawJsonDocument}
                        className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold"
                      >
                        Gem JSON Direkte i MongoDB
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={22}
                    className="form-control font-monospace small bg-dark text-light border-0 rounded-3 p-3"
                    style={{ fontSize: "0.78rem" }}
                    value={rawJsonEditorText}
                    onChange={(e) => setRawJsonEditorText(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE SPLIT-SCREEN SITE PREVIEW */}
        {showSplitPreview && (
          <div className="col-lg-4">
            <div className="card border-0 shadow-xs rounded-4 bg-white h-100">
              <div className="card-header bg-white border-bottom p-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <span className="badge bg-warning text-dark rounded-pill px-2.5 py-1 me-2">
                    Live Preview ({selectedLocale.toUpperCase()})
                  </span>
                  <span className="fw-bold small text-dark">
                    Se hjemmesiden før udgivelse
                  </span>
                </div>
                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIframeRefreshKey((k) => k + 1)}
                    className="btn btn-sm btn-light border rounded-pill px-2.5"
                    title="Opdater Preview"
                  >
                    <i className="bi bi-arrow-clockwise"></i>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenFullSitePreview(previewRoute)}
                    className="btn btn-sm btn-outline-primary rounded-pill px-2.5"
                    title="Åbn i fuld skærm"
                  >
                    Fuld skærm ↗
                  </button>
                </div>
              </div>

              <div className="px-3 py-2 bg-light border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    onClick={() => setPreviewRoute("/")}
                    className={`btn ${
                      previewRoute === "/" ? "btn-dark" : "btn-outline-secondary"
                    }`}
                  >
                    Landingpage
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewRoute("/dashboard/personal")}
                    className={`btn ${
                      previewRoute === "/dashboard/personal"
                        ? "btn-dark"
                        : "btn-outline-secondary"
                    }`}
                  >
                    Klientportal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewRoute("/dashboard/therapist")}
                    className={`btn ${
                      previewRoute === "/dashboard/therapist"
                        ? "btn-dark"
                        : "btn-outline-secondary"
                    }`}
                  >
                    Terapeutportal
                  </button>
                </div>

                <span className="small text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                  /{selectedLocale}
                  {previewRoute === "/" ? "" : previewRoute}
                </span>
              </div>

              <div className="card-body p-0 position-relative" style={{ minHeight: "650px" }}>
                <iframe
                  key={`${selectedLocale}-${previewRoute}-${iframeRefreshKey}-${previewHighlightMissing}`}
                  src={`/${selectedLocale}${previewRoute === "/" ? "" : previewRoute}`}
                  title="Live Sprog-Forhåndsvisning"
                  style={{
                    width: "100%",
                    height: "680px",
                    border: "none",
                    borderBottomLeftRadius: "1rem",
                    borderBottomRightRadius: "1rem",
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

