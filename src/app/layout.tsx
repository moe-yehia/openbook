import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers, themeBootScript } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "OpenBook — Active learning, not content delivery",
    template: "%s · OpenBook",
  },
  description:
    "OpenBook guides you through your own material with interactive retrieval-practice loops — it reads with you, asks the hard questions, and makes it stick. Not another tool that hands you a summary and walks away.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  applicationName: "OpenBook",
  openGraph: {
    title: "OpenBook — Active learning, not content delivery",
    description:
      "It reads with you, asks the hard questions, and makes it stick.",
    siteName: "OpenBook",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F3" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1E1E" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
