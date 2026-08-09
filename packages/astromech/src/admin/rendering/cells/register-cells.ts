/**
 * Side-effect module: registers every built-in cell renderer into the cell
 * registry. Imported once at admin bundle load (src/admin/main.tsx) so cells are
 * available before any render.
 */
import { registerCell } from '../cell-registry';
import { BadgeCell } from './badge-cell';
import { BooleanCell } from './boolean-cell';
import { DateCell } from './date-cell';
import { LocaleCell } from './locale-cell';
import { NumberCell } from './number-cell';
import { RelationshipCell } from './relationship-cell';
import { SlugCell } from './slug-cell';
import { TextCell } from './text-cell';
import { TitleCell } from './title-cell';
import { TranslationsCell } from './translations-cell';

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
