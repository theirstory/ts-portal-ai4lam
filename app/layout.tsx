import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import './globals.css';
import { AppTopBar } from '@/components/AppTopBar/AppTopBar';
import { MainContainer } from './MainContainer';
import { EmbedGuard } from './EmbedGuard';
import MaterialUIThemeProvider from '@/components/ThemeProvider';
import { FloatingChatDrawer } from '@/components/FloatingChatDrawer';
import { organizationConfig } from '@/config/organizationConfig';

const siteTitle =
  organizationConfig.displayName && organizationConfig.name && organizationConfig.displayName !== organizationConfig.name
    ? `${organizationConfig.displayName} - ${organizationConfig.name}`
    : organizationConfig.displayName || organizationConfig.name;
const siteDescription = organizationConfig.description;

/**
 * Where this portal is deployed. Link previews have to name images by absolute
 * URL, and a server component has no way to know the host otherwise — a
 * relative path is what leaves Slack showing an empty image frame.
 */
const siteUrl = (organizationConfig.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || '').trim();
const socialImage = organizationConfig.socialImage || '/images/og-image.jpg';

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: 'website',
    ...(siteUrl ? { url: siteUrl } : {}),
    siteName: siteTitle,
    images: [
      {
        // Served from public/, which the gatekeeper lets through because the
        // path has a file extension — a preview crawler is never logged in.
        url: socialImage,
        width: 1200,
        height: 630,
        alt: siteTitle,
      },
    ],
  },
  twitter: {
    // The large card is what shows the image rather than a thumbnail beside
    // the text.
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning on <html>: browser extensions (password managers,
  // screen recorders, translation tools) inject attributes onto <html> before
  // React hydrates, which React would otherwise report as a mismatch. Same
  // reason <body> already carries it. It only suppresses attribute diffs on
  // that element itself, not on anything nested inside it.
  return (
    <html className=" overflow-x-hidden" lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <MaterialUIThemeProvider>
          <Suspense>
            <MainContainer>
              <EmbedGuard>
                <AppTopBar />
              </EmbedGuard>
              {children}
              <FloatingChatDrawer />
            </MainContainer>
          </Suspense>
        </MaterialUIThemeProvider>
      </body>
    </html>
  );
}
