// Admin component styles are imported for their side effect; the host app's
// bundler injects them. Declared so the package's isolated `tsc` resolves the
// `import './x.css'` side-effect imports in the admin components.
declare module '*.css';
