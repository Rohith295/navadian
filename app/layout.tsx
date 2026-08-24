import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { UserProvider } from '@/components/user-provider';
import { Analytics } from "@vercel/analytics/next"
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'navaloom - Project Management Tool',
  description: 'Project Management Reimagined for Builders',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Project Management Reimagined for Builders" />
        
        {/* Icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/icon-black.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/icon-white.png" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        
        {/* Open Graph */}
        <meta property="og:title" content="navaloom - Project Management Tool" />
        <meta property="og:description" content="Project Management Reimagined for Builders" />
        <meta property="og:site_name" content="navaloom" />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="navaloom - Project Management Tool" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:type" content="website" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="navaloom - Project Management Tool" />
        <meta name="twitter:description" content="Project Management Reimagined for Builders" />
        <meta name="twitter:image" content="/og-image.png" />

        {/* SEO */}
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />
        <meta name="keywords" content="kanban, project management, task management, productivity, builders, developers" />
        <meta name="author" content="navaloom Team" />
        <meta name="category" content="Productivity" />

        {/* Web App Manifest */}
        <link rel="manifest" href="/web-app-manifest-512x512.png" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        
          <UserProvider>
          <Analytics />
            {children}
            <Toaster />
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
