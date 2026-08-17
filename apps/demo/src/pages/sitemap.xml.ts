import type { APIRoute } from 'astro';
import { getAstromech } from 'astromech';
import { locales, localizedPath } from '../lib/site.ts';

export const GET: APIRoute = async ({ site, url: requestUrl }) => {
    // `site` is the origin from `astro.config.mjs`; the request origin only
    // stands in if a deployment ever ships without one.
    const origin = (site ?? requestUrl).origin;
    const urls: { loc: string; lastmod: string }[] = [];

    try {
        const app = await getAstromech();
        const result = await app.plugins.seo.sitemap();
        // For each URL, also emit locale alternates
        for (const url of result.urls) {
            urls.push({ loc: url.loc, lastmod: url.lastmod });
            // emit locale variants
            for (const locale of locales()) {
                const locPath = localizedPath(url.loc, locale);
                if (locPath !== url.loc) {
                    urls.push({ loc: locPath, lastmod: url.lastmod });
                }
            }
        }
    } catch {
        // Plugin not available
    }

    const body =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
        urls
            .map(
                (url) =>
                    `<url><loc>${origin}${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`
            )
            .join('\n') +
        '\n</urlset>';

    return new Response(body, {
        headers: { 'Content-Type': 'application/xml' },
    });
};
