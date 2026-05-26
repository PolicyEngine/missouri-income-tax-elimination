import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

const CANONICAL_HOST = 'policyengine.org';
const CANONICAL_URL =
  'https://policyengine.org/us/missouri-income-tax-elimination';

/**
 * Host-aware sitemap: only emit entries on the canonical host. Preview /
 * standalone deployments return an empty sitemap so crawlers can't index a
 * duplicate copy of the page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const host =
    hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? CANONICAL_HOST;
  if (host !== CANONICAL_HOST) return [];

  return [
    {
      url: CANONICAL_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
