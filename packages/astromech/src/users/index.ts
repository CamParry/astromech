/** `users` domain module — user CRUD service, better-auth integration, and roles/auth tables. */
export { usersService } from './service.js';
export { usersDescriptors } from './methods.js';
export { createUserSchema, updateUserSchema } from './schema.js';
export { auth } from './auth.js';
export { resolveSessionUser } from './session.js';
