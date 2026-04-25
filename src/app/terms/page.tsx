export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Terms of Use</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">1. Ownership</h2>
          <p className="mt-1">All intellectual property, platform code, business logic, models, and outputs are owned by Rahul Yadav. No transfer of ownership occurs by use of this platform.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">2. License</h2>
          <p className="mt-1">Users are granted a limited, non-exclusive, non-transferable, revocable license to use the platform for internal evaluation and analysis purposes only.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">3. No Reliance</h2>
          <p className="mt-1">Outputs from this platform are AI-generated and may be incomplete or inaccurate. Users must not rely solely on platform outputs for any financial, legal, regulatory, or investment decision. Independent professional verification is required.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">4. Limitation of Liability</h2>
          <p className="mt-1">The platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied. The platform owner shall not be liable for any direct, indirect, incidental, consequential, or punitive losses or damages arising from use of, or reliance on, the platform or its outputs.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">5. Indemnity</h2>
          <p className="mt-1">User agrees to indemnify, defend, and hold harmless the platform owner from any claims, damages, or expenses arising out of user&apos;s use of the platform or violation of these terms.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">6. Prohibited Use</h2>
          <p className="mt-1">Unauthorized replication, reverse-engineering, redistribution, or commercial resale of the platform, its logic, or its outputs is strictly prohibited.</p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">7. Governing Law</h2>
          <p className="mt-1">These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.</p>
        </div>
      </section>
    </div>
  );
}
