import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "ELECTRO-LMESTOUR · الكريدي",
  description: "تسيير كريدي الزبناء ديال ELECTRO-LMESTOUR",
  applicationName: "ELECTRO-LMESTOUR",
  appleWebApp: { capable: true, title: "الكريدي", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b5d46" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1714" },
  ],
};

// The browser can offer the install prompt before React has loaded: keep it for InstallButton.
const CATCH_INSTALL_PROMPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event("installprompt-ready"))});`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may set data-theme on <html> before React loads.
    <html lang="ar" dir="rtl" className={plex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: CATCH_INSTALL_PROMPT }} />
      </head>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
