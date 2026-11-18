import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  I18nFeatureView,
  CachedI18nProvider,
  LanguageSwitcher,
  I18N_PAGE_SIZE,
  isSupportedLocaleCode,
  mergeWithFallbackClient,
  setLocaleCookie,
  getCookieValue,
  useI18nCache,
  resolveUiLocale,
  useUiLocale,
} from "./I18nFeature";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("I18nFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("validates ISO locale codes, merges nested fallback dictionaries, and sets cookies", () => {
    expect(isSupportedLocaleCode("da")).toBe(true);
    expect(isSupportedLocaleCode("en-GB")).toBe(true);
    expect(isSupportedLocaleCode("invalid_locale_123")).toBe(false);
    expect(isSupportedLocaleCode("")).toBe(false);

    setLocaleCookie("da");
    expect(document.cookie).toContain("NEXT_LOCALE=da");
    expect(getCookieValue("NEXT_LOCALE")).toBe("da");
    expect(getCookieValue("NON_EXISTENT_COOKIE")).toBeNull();

    expect(mergeWithFallbackClient(null as any, null as any, "en", false)).toEqual({});
    const mergedNullSub = mergeWithFallbackClient(
      null as any,
      { Group: { emptyVal: null } },
      "en",
      true
    );
    expect(mergedNullSub.Group.emptyVal).toContain("Group.emptyVal");

    const fallback = {
      Common: {
        save: "Gem",
        cancel: "Annuller",
      },
    };
    const target = {
      Common: {
        save: "Save",
        cancel: "",
      },
    };

    const mergedStandard = mergeWithFallbackClient(target, fallback, "en", false);
    expect(mergedStandard.Common.save).toBe("Save");
    expect(mergedStandard.Common.cancel).toBe("Annuller");

    const mergedPreview = mergeWithFallbackClient(target, fallback, "en", true);
    expect(mergedPreview.Common.cancel).toContain(
      "⚠️ [Mangler EN: Common.cancel] Annuller"
    );
  });

  it("renders dictionary entries, creates a translation key, and deletes it", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "k-1",
          locale: "da",
          translationKey: "Common.save",
          translationValue: "Gem",
        },
      ],
    });

    const CacheReader = () => {
      const ctx = useI18nCache();
      return <span data-testid="ctx-check">{ctx ? "active" : "null"}</span>;
    };

    render(
      <>
        <CacheReader />
        <I18nFeatureView />
      </>
    );

    await waitFor(() => {
      expect(screen.getByText("Common.save")).toBeDefined();
      expect(screen.getByTestId("ctx-check").textContent).toBe("null");
    });

    fireEvent.change(screen.getByTestId("input-i18n-locale"), {
      target: { value: "en" },
    });
    fireEvent.change(screen.getByTestId("input-i18n-key"), {
      target: { value: "Common.cancel" },
    });
    fireEvent.change(screen.getByTestId("input-i18n-value"), {
      target: { value: "Cancel" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "k-2",
        locale: "en",
        translationKey: "Common.cancel",
        translationValue: "Cancel",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-i18n"));

    await waitFor(() => {
      expect(screen.getByText("Common.cancel")).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-i18n-k-2"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    expect(screen.getByText("Common.cancel")).toBeDefined();

    fireEvent.click(screen.getByTestId("delete-i18n-k-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

    await waitFor(() => {
      expect(screen.queryByText("Common.cancel")).toBeNull();
    });

    // Also test inside CachedI18nProvider where create & delete trigger invalidateI18nCache(locale)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "k-10",
            locale: "da",
            translationKey: "Common.title",
            translationValue: "Titel",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "k-11",
          locale: "da",
          translationKey: "Common.ok",
          translationValue: "OK",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Common: { ok: "OK" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Common: { title: "Titel" } }),
      });

    render(
      <CachedI18nProvider initialLocale="da" initialMessages={{ Common: { title: "Titel" } }}>
        <I18nFeatureView />
      </CachedI18nProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("Common.title")).toBeDefined();
    });
    const keyInputs = screen.getAllByTestId("input-i18n-key");
    const valInputs = screen.getAllByTestId("input-i18n-value");
    const submitBtns = screen.getAllByTestId("submit-i18n");
    fireEvent.change(keyInputs[keyInputs.length - 1], {
      target: { value: "Common.ok" },
    });
    fireEvent.change(valInputs[valInputs.length - 1], {
      target: { value: "OK" },
    });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByTestId("delete-i18n-k-11")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("delete-i18n-k-11"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.queryByTestId("delete-i18n-k-11")).toBeNull();
    });
  });

  it("enforces DomainGuard on invalid locale codes and renders ProblemDetail", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<I18nFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId("input-i18n-locale"), {
      target: { value: "12345" },
    });
    fireEvent.change(screen.getByTestId("input-i18n-key"), {
      target: { value: "Common.test" },
    });
    fireEvent.change(screen.getByTestId("input-i18n-value"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByTestId("submit-i18n"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("VALIDATION_FAILED");
      expect(screen.getByTestId("field-error-locale").textContent).toContain(
        "Locale code must be a valid ISO 639-1 code"
      );
    });

    const problem: ProblemDetail = {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Translation key already locked",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-i18n-locale"), {
      target: { value: "da" },
    });
    fireEvent.click(screen.getByTestId("submit-i18n"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("CONFLICT");
    });
  });

  it("switches locale and invalidates cache via CachedI18nProvider and LanguageSwitcher", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/i18n/en")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Common: { save: "Save" } }),
        };
      }
      if (url.includes("/api/backend/i18n/da")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Common: { save: "Gem", cancel: "Annuller" } }),
        };
      }
      if (url.includes("/api/backend/i18n/de")) {
        return { ok: false, status: 500 };
      }
      if (url.includes("/api/backend/i18n/fr")) {
        throw new Error("network down");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ Common: { save: "Guardar" } }),
      };
    });
    global.fetch = fetchMock;

    const CacheActionsTester = () => {
      const cache = useI18nCache();
      return (
        <div>
          <span data-testid="active-locale">{cache?.locale}</span>
          <span data-testid="active-save-msg">
            {cache?.messages?.Common?.save}
          </span>
          <span data-testid="active-cancel-msg">
            {cache?.messages?.Common?.cancel}
          </span>
          <button
            type="button"
            data-testid="btn-invalid-locale"
            onClick={() => void cache?.switchLocale("invalid_123")}
          >
            Invalid
          </button>
          <button
            type="button"
            data-testid="btn-invalidate-cache"
            onClick={() => cache?.invalidateI18nCache()}
          >
            Invalidate
          </button>
        </div>
      );
    };

    const onLocaleNavigate = vi.fn();

    const { rerender } = render(
      <CachedI18nProvider
        initialLocale="da"
        initialMessages={{ Common: { save: "Gem", cancel: "Annuller" } }}
      >
        <LanguageSwitcher onLocaleNavigate={onLocaleNavigate} />
        <CacheActionsTester />
      </CachedI18nProvider>
    );

    const select = screen.getByTestId(
      "language-switcher-select"
    ) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "da",
      "en",
      "fr",
      "es",
      "de",
    ]);
    expect(screen.getByTestId("active-locale").textContent).toBe("da");
    expect(screen.getByTestId("active-save-msg").textContent).toBe("Gem");

    fireEvent.change(select, {
      target: { value: "en" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("active-locale").textContent).toBe("en");
      expect(screen.getByTestId("active-save-msg").textContent).toBe("Save");
      expect(screen.getByTestId("active-cancel-msg").textContent).toBe("Annuller");
    });
    expect(onLocaleNavigate).toHaveBeenCalledWith("en");

    // Switching back to da uses direct dictionary without extra fallback fetch
    fireEvent.change(select, { target: { value: "da" } });
    await waitFor(() => {
      expect(screen.getByTestId("active-save-msg").textContent).toBe("Gem");
    });

    // Non-ok response and thrown fetch both degrade gracefully without wiping existing messages
    fireEvent.change(select, { target: { value: "de" } });
    await waitFor(() => {
      expect(screen.getByTestId("active-locale").textContent).toBe("de");
    });
    fireEvent.change(select, { target: { value: "fr" } });
    await waitFor(() => {
      expect(screen.getByTestId("active-locale").textContent).toBe("fr");
    });

    // es when fallback /da returns non-ok skips fallback merge gracefully
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Common: { save: "Guardar" } }),
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    fireEvent.change(select, { target: { value: "es" } });
    await waitFor(() => {
      expect(screen.getByTestId("active-save-msg").textContent).toBe("Guardar");
    });

    // Invalid locale is ignored
    fireEvent.click(screen.getByTestId("btn-invalid-locale"));
    expect(screen.getByTestId("active-locale").textContent).toBe("es");

    // Invalidate cache refreshes cookie & fetches current locale dictionary
    fireEvent.click(screen.getByTestId("btn-invalidate-cache"));
    expect(getCookieValue("NEXT_LOCALE")).toBe("es");

    // Rerendering CachedI18nProvider with new Next.js server props syncs locale & messages
    rerender(
      <CachedI18nProvider
        initialLocale="en"
        initialMessages={{ Common: { save: "SaveSynced", cancel: "Cancel" } }}
      >
        <LanguageSwitcher onLocaleNavigate={onLocaleNavigate} />
        <CacheActionsTester />
      </CachedI18nProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("active-locale").textContent).toBe("en");
      expect(screen.getByTestId("active-save-msg").textContent).toBe(
        "SaveSynced"
      );
    });

    // Standalone LanguageSwitcher driven by explicit currentLocale prop
    const standaloneNavigate = vi.fn();
    render(
      <LanguageSwitcher
        currentLocale="fr"
        onLocaleNavigate={standaloneNavigate}
        className="custom-pill"
      />
    );
    const selects = screen.getAllByTestId(
      "language-switcher-select"
    ) as HTMLSelectElement[];
    const standaloneSelect = selects[selects.length - 1];
    expect(standaloneSelect.value).toBe("fr");
    fireEvent.change(standaloneSelect, { target: { value: "es" } });
    expect(standaloneNavigate).toHaveBeenCalledWith("es");
  });

  it("resolves supported UI locales with resolveUiLocale and useUiLocale across defaults, context, and overrides", () => {
    expect(resolveUiLocale(undefined)).toBe("da");
    expect(resolveUiLocale("")).toBe("da");
    expect(resolveUiLocale("da")).toBe("da");
    expect(resolveUiLocale("es-ES")).toBe("es");
    expect(resolveUiLocale("FR_ca")).toBe("fr");
    expect(resolveUiLocale("de")).toBe("de");
    expect(resolveUiLocale("sv")).toBe("en");

    const LocaleProbe: React.FC<{ override?: string | null }> = ({ override }) => {
      const resolved = useUiLocale(override);
      return <span data-testid="resolved-ui-locale">{resolved}</span>;
    };

    const { rerender } = render(<LocaleProbe />);
    expect(screen.getByTestId("resolved-ui-locale").textContent).toBe("da");

    rerender(
      <CachedI18nProvider initialLocale="es" initialMessages={{}}>
        <LocaleProbe />
      </CachedI18nProvider>
    );
    expect(screen.getByTestId("resolved-ui-locale").textContent).toBe("es");

    rerender(
      <CachedI18nProvider initialLocale="es" initialMessages={{}}>
        <LocaleProbe override="de-AT" />
      </CachedI18nProvider>
    );
    expect(screen.getByTestId("resolved-ui-locale").textContent).toBe("de");
  });

  it("supports search, locale filter chips, 25-per-page pagination, and empty filter state", async () => {
    expect(I18N_PAGE_SIZE).toBe(25);
    const items = Array.from({ length: 25 }, (_, idx) => ({
      id: `p-${idx + 1}`,
      locale: "da",
      translationKey: `PageKey.${idx + 1}`,
      translationValue: `Dansk værdi ${idx + 1}`,
    }));
    items.push(
      {
        id: "p-26",
        locale: "de",
        translationKey: "German.greeting",
        translationValue: "Guten Tag",
      },
      {
        id: "p-27",
        locale: "da",
        translationKey: "PageKey.27",
        translationValue: "Særlig søgetekst",
      }
    );

    const fetchMock = vi.fn().mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            type: "about:blank",
            title: "Delete failed",
            status: 500,
            detail: "Locked key",
            errorCode: ErrorCode.INTERNAL_ERROR,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => items,
      };
    });
    global.fetch = fetchMock;

    render(<I18nFeatureView />);

    await waitFor(() => {
      expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("27 / 27");
    });

    // Page 1 shows item 1 and hides page-2 items
    expect(screen.getByText("PageKey.1")).toBeDefined();
    expect(screen.queryByText("German.greeting")).toBeNull();
    expect(screen.getByTestId("i18n-pagination")).toBeDefined();

    // Next & Prev page buttons
    fireEvent.click(screen.getByTestId("i18n-next-page"));
    expect(screen.getByText("German.greeting")).toBeDefined();
    expect(screen.getByText("PageKey.27")).toBeDefined();
    expect(screen.queryByText("PageKey.1")).toBeNull();

    fireEvent.click(screen.getByTestId("i18n-prev-page"));
    expect(screen.getByText("PageKey.1")).toBeDefined();

    // Locale filter chip ("de")
    fireEvent.click(screen.getByTestId("filter-i18n-locale-de"));
    expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("1 / 27");
    expect(screen.getByText("German.greeting")).toBeDefined();
    expect(screen.queryByTestId("i18n-pagination")).toBeNull();

    // Failed delete keeps row and hits remove() === false branch
    fireEvent.click(screen.getByTestId("delete-i18n-p-26"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    expect(screen.getByText("German.greeting")).toBeDefined();

    // Reset to all locales
    fireEvent.click(screen.getByTestId("filter-i18n-locale-all"));
    expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("27 / 27");

    // Search by key, then by value, then non-matching empty state
    const searchInput = screen.getByTestId("input-i18n-search");
    fireEvent.change(searchInput, { target: { value: "PageKey.27" } });
    expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("1 / 27");
    expect(screen.getByText("PageKey.27")).toBeDefined();

    fireEvent.change(searchInput, { target: { value: "søgetekst" } });
    expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("1 / 27");
    expect(screen.getByText("PageKey.27")).toBeDefined();

    fireEvent.change(searchInput, { target: { value: "ingen_match_xyz" } });
    expect(screen.getByTestId("i18n-filtered-count").textContent).toContain("0 / 27");
    expect(screen.getByTestId("i18n-empty-filter")).toBeDefined();
    expect(screen.queryByTestId("i18n-list")).toBeNull();
  });

  it("handles default Common namespace, omitted CachedI18nProvider locale, and standalone LanguageSwitcher", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "k-common",
            locale: "da",
            translationKey: ".dotOnly",
            translationValue: "Værdi",
          }),
        };
      }
      if (url.includes("/api/backend/i18n/da")) {
        return { ok: true, status: 200, json: async () => ({ Common: { hello: "Hej" } }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const TriggerDefaults = () => {
      const cache = useI18nCache();
      return (
        <div>
          <LanguageSwitcher />
          <button
            type="button"
            data-testid="btn-invalidate-default"
            onClick={() => cache?.invalidateI18nCache()}
          >
            Inv
          </button>
        </div>
      );
    };

    render(
      <>
        <LanguageSwitcher />
        <CachedI18nProvider initialMessages={{ Common: { hello: "Hej" } }}>
          <TriggerDefaults />
          <I18nFeatureView />
        </CachedI18nProvider>
      </>
    );

    await waitFor(() => expect(screen.getByTestId("btn-invalidate-default")).toBeDefined());
    fireEvent.click(screen.getByTestId("btn-invalidate-default"));

    fireEvent.change(screen.getByTestId("input-i18n-key"), { target: { value: ".dotOnly" } });
    fireEvent.change(screen.getByTestId("input-i18n-value"), { target: { value: "Værdi" } });
    fireEvent.click(screen.getByTestId("submit-i18n"));
    await waitFor(() => expect(screen.getByText(".dotOnly")).toBeDefined());
  });
});
