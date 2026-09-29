import { useI18n } from '../lib/i18n';

export const LanguageSwitcher = () => {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex gap-2 items-center" data-testid="language-switcher">
      <span className="text-sm text-gray-500">Language:</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        className="border border-gray-300 rounded p-1 text-sm bg-white text-black"
        data-testid="language-dropdown"
      >
        <option value="en" data-testid="language-option-english">English</option>
        <option value="da" data-testid="language-option-danish">Danish</option>
      </select>
    </div>
  );
};
