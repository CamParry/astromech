import { defineMiddleware, sequence } from 'astro:middleware';
import Astromech from 'astromech/local';

const redirectsMiddleware = defineMiddleware(async (context, next) => {
    try {
        const match = await Astromech.plugins.redirects.lookup({
            from: context.url.pathname,
        });
        if (match) {
            // `Astro.redirect` wants a literal status, not a widened `number`.
            return context.redirect(match.to, match.status === '301' ? 301 : 302);
        }
    } catch {
        // redirects plugin not available or lookup failed
    }
    return next();
});

export const onRequest = sequence(redirectsMiddleware);
