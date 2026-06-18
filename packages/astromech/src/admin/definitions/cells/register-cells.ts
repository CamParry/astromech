/**
 * Side-effect module: registers every built-in cell renderer into the cell
 * registry. Imported once at admin bundle load (src/admin/main.tsx) so cells are
 * available before any render.
 */
import { registerCell } from '../cell-registry.js';
import { BadgeCell } from './badge-cell.js';
import { BooleanCell } from './boolean-cell.js';
import { DateCell } from './date-cell.js';
import { LocaleCell } from './locale-cell.js';
import { NumberCell } from './number-cell.js';
import { RelationshipCell } from './relationship-cell.js';
import { SlugCell } from './slug-cell.js';
import { TextCell } from './text-cell.js';
import { TitleCell } from './title-cell.js';
import { TranslationsCell } from './translations-cell.js';

registerCell('text', TextCell);
registerCell('title', TitleCell);
registerCell('badge', BadgeCell);
registerCell('slug', SlugCell);
registerCell('date', DateCell);
registerCell('boolean', BooleanCell);
registerCell('number', NumberCell);
registerCell('relationship', RelationshipCell);
registerCell('locale', LocaleCell);
registerCell('translations', TranslationsCell);
