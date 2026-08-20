/**
 * Cell-renderer registry — cell kind → React cell component. A module-level
 * Map suffices (no globalThis): the admin SPA is a single Vite bundle with
 * one module graph, so there's no multi-entry chunk duplication to guard against.
 */
import type { CellKind, CellRenderer } from '@/types/index';

const registry = new Map<CellKind, CellRenderer>();

export function registerCell(kind: CellKind, renderer: CellRenderer): void {
    registry.set(kind, renderer);
}

/** Resolve a cell renderer; falls back to the 'text' renderer for unknown kinds. */
export function getCellRenderer(kind: CellKind): CellRenderer {
    return registry.get(kind) ?? registry.get('text') ?? (() => null);
}
