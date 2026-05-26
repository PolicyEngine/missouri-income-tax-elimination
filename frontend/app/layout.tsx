import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const GA_ID = 'G-2YHG89FY0N';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const SITE_URL = 'https://policyengine.org/us/missouri-income-tax-elimination';
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const DESCRIPTION =
  "Explore paths to eliminating Missouri's individual income tax. Customize a reform scenario and see household and 10-year state revenue impacts.";

export const viewport: Viewport = {
  themeColor: '#2C7A7B',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Missouri Income Tax Elimination Calculator',
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Missouri Income Tax Elimination Calculator',
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Missouri Income Tax Elimination Calculator by PolicyEngine',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Missouri Income Tax Elimination Calculator',
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  icons: {
    icon: '/favicon.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// JSON-LD structured data: WebApplication + the two Missouri resolutions
// (HJR 173 and HJR 174) the calculator analyzes.
const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Missouri Income Tax Elimination Calculator',
    url: SITE_URL,
    description: DESCRIPTION,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: {
      '@type': 'Organization',
      name: 'PolicyEngine',
      url: 'https://policyengine.org',
      logo: 'https://policyengine.org/assets/logos/policyengine/blue.png',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: 'Missouri House Joint Resolution 173 (HJR 173)',
    legislationIdentifier: 'HJR 173',
    legislationJurisdiction: 'US-MO',
    legislationType: 'Proposed legislation',
    inLanguage: 'en',
    about:
      "Proposed amendment to Missouri's constitution to phase out the individual income tax.",
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: 'Missouri House Joint Resolution 174 (HJR 174)',
    legislationIdentifier: 'HJR 174',
    legislationJurisdiction: 'US-MO',
    legislationType: 'Proposed legislation',
    inLanguage: 'en',
    about:
      "Proposed amendment to Missouri's constitution related to income tax elimination.",
  },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <Script
          id="ld-json"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
