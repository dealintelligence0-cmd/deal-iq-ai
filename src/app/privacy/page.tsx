export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Data We Collect</h2>
          <p className="mt-1">We collect: account information you provide (email, profile details), deal data you upload or input, platform usage telemetry (pages, actions, AI calls), and optional file uploads (CSV/XLSX/JSON).</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Purpose of Collection</h2>
          <p className="mt-1">Data is used solely to provide the platform&apos;s features, improve output quality, and ensure operational security. We do not use your data for unrelated purposes.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">No Sale of Data</h2>
          <p className="mt-1">We do not sell, rent, or trade user data to third parties.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Security</h2>
          <p className="mt-1">Reasonable industry-standard security measures are applied (encryption at rest for sensitive credentials, row-level access control, HTTPS in transit). No method of transmission or storage is 100% secure.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Third-Party AI Providers</h2>
          <p className="mt-1">When you use AI features, your prompt content (deal facts, research queries) is transmitted to your selected AI provider (OpenAI, Anthropic, Google, etc.) under their respective privacy policies. You control which providers are used via API keys saved in Settings.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Data Deletion</h2>
          <p className="mt-1">You may delete your data at any time via Settings → Danger Zone, or contact the platform owner for account deletion.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Contact</h2>
          <p className="mt-1">For privacy questions, contact the platform owner directly.</p>
        </div>
      </section>
    </div>
  );
}
