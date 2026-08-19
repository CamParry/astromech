/** `users` domain module — user CRUD service, better-auth integration, and roles/auth tables. */
export { usersService } from './service';
export { usersContract } from './contract';
export { createUserSchema, updateUserSchema } from './schema';
export { getAuth } from './auth';
export { getSession } from './session';
