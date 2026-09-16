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

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
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
