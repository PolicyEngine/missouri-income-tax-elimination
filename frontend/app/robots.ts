import type { MetadataRoute } from 'next';

const CANONICAL_URL =
  'https://policyengine.org/us/missouri-income-tax-elimination';

/**
 * Static robots.txt pointing at the canonical PolicyEngine-hosted version.
 * (A previous host-aware variant used next/headers, which forced robots.txt
 * to be server-rendered on demand and broke the Vercel static deployment.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${CANONICAL_URL}/sitemap.xml`,
  };
}
