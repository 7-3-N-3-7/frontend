import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  I18nFeatureView,
  CachedI18nProvider,
  LanguageSwitcher,
  isSupportedLocaleCode,
  mergeWithFallbackClient,
  setLocaleCookie,
  getCookieValue,
  useI18nCache,
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

    await waitFor(() => {
      expect(screen.queryByText("Common.cancel")).toBeNull();
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
    const CacheActionsTester = () => {
      const cache = useI18nCache();
      return (
        <div>
          <span data-testid="active-locale">{cache?.locale}</span>
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

    render(
      <CachedI18nProvider
        initialLocale="da"
        initialMessages={{ Common: { save: "Gem" } }}
      >
        <LanguageSwitcher />
        <CacheActionsTester />
      </CachedI18nProvider>
    );

    expect(screen.getByTestId("active-locale").textContent).toBe("da");

    fireEvent.change(screen.getByTestId("language-switcher-select"), {
      target: { value: "en" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("active-locale").textContent).toBe("en");
    });

    // Invalid locale is ignored
    fireEvent.click(screen.getByTestId("btn-invalid-locale"));
    expect(screen.getByTestId("active-locale").textContent).toBe("en");

    // Invalidate cache refreshes cookie
    fireEvent.click(screen.getByTestId("btn-invalidate-cache"));
    expect(getCookieValue("NEXT_LOCALE")).toBe("en");
  });
});
