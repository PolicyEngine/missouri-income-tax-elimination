import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const CANONICAL_HOST = 'policyengine.org';

/**
 * Host-aware robots.txt:
 * - On the canonical host (policyengine.org), allow indexing and expose the sitemap.
 * - On preview/standalone deployments (e.g. *.vercel.app), disallow indexing so
 *   the canonical embedded version is the only one search engines see.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const host =
    hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? CANONICAL_HOST;
  const isCanonical = host === CANONICAL_HOST;

  if (!isCanonical) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap:
      'https://policyengine.org/us/missouri-income-tax-elimination/sitemap.xml',
  };
}
