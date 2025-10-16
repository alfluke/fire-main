import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/layout/header";
import { Toaster } from "@/components/ui/toaster";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Providers } from "@/components/providers/session-provider";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased h-full flex flex-col">
        <Providers>
          <AuthGuard>
            <AppHeader />
            <main className="flex-1">
              {children}
            </main>
          </AuthGuard>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
