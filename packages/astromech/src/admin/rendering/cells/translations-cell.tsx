import type { CellRenderer } from '@/types/index.js';
import { Link } from './link.js';

export const TranslationsCell: CellRenderer = ({ entry, ctx }) => (
    <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {ctx.configuredLocales.map((loc) => {
            const siblingId = entry.locales[loc];
            const isCurrent = siblingId === entry.id;
            const present = siblingId != null;
            if (!present) {
                return (
                    <span
                        key={loc}
                        className="am-text-mono am-text-muted"
                        style={{ opacity: 0.4, fontSize: '0.75rem' }}
                        title={`${loc.toUpperCase()} translation does not exist`}
                    >
                        {loc.toUpperCase()}
                    </span>
                );
            }
            if (isCurrent) {
                return (
                    <span
                        key={loc}
                        className="am-text-mono"
                        style={{ fontWeight: 600, fontSize: '0.75rem' }}
                    >
                        {loc.toUpperCase()}
                    </span>
                );
            }
            return (
                <Link
                    key={loc}
                    to={`${ctx.basePath}/${siblingId}`}
                    className="am-link am-text-mono"
                    style={{ fontSize: '0.75rem' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {loc.toUpperCase()}
                </Link>
            );
        })}
    </span>
);
