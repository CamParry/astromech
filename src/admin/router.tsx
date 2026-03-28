import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

declare const __ASTROMECH_ADMIN_ROUTE__: string;

export const router = createRouter({
	routeTree,
	basepath: __ASTROMECH_ADMIN_ROUTE__,
	defaultNotFoundComponent: () => <div>Page not found</div>,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
