import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ReferenceProvider, ThemeProvider } from "@/hooks/use-reference";
import { ThemeScript } from "@/components/theme-script";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rise Next Banking Services · Loan CRM",
  description:
    "Multi-bank loan tracking and management workspace for Rise Next Banking Services DSA operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            {/*
              Notification state is NOT mounted here — it lives in `AppShell`
              (Task 10.9 / D-078), which wraps exactly the two consumers that
              must agree: the topbar badge and the notifications page. Mounting
              it at the root would also run it on `/login`, `/accept-invite` and
              `/reset-password`, which have no session to fetch for.
            */}
            <ReferenceProvider>
              <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
              <Toaster position="top-right" richColors closeButton />
            </ReferenceProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
