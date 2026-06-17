/**
 * Cell-renderer registry — cell kind → React cell component.
 *
 * Module-level Map (no globalThis): the admin SPA is a single Vite bundle with
 * one module graph, so there is no tsup multi-entry chunk duplication to guard
 * against (contrast src/storage/entries/registry.ts, which must use globalThis).
 */
import type { CellKind, CellRenderer } from '@/types/index.js';

const registry = new Map<CellKind, CellRenderer>();

export function registerCell(kind: CellKind, renderer: CellRenderer): void {
    registry.set(kind, renderer);
}

/** Resolve a cell renderer; falls back to the 'text' renderer for unknown kinds. */
export function getCellRenderer(kind: CellKind): CellRenderer {
    return registry.get(kind) ?? registry.get('text') ?? (() => null);
}
