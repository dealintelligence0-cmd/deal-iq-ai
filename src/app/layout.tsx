

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal IQ AI — Intelligent Deal & Proposal Platform",
  description:
    "Win more deals with AI-powered deal intelligence, proposal generation, and negotiation insights.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var m=t||s;if(m==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="antialiased"
        style={{
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
