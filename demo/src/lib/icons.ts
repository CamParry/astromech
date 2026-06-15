/**
 * Convert a Lucide PascalCase icon name to an iconify lucide: id.
 * e.g. "Code2" -> "lucide:code-2", "LayoutTemplate" -> "lucide:layout-template"
 */
export function lucideIconName(pascal: string): string {
    // Insert a separator before each uppercase letter that follows a lowercase letter or digit,
    // and before each digit run that follows a letter.
    const kebab = pascal
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-zA-Z])(\d)/g, '$1-$2')
        .replace(/(\d)([a-zA-Z])/g, '$1-$2')
        .toLowerCase();
    return `lucide:${kebab}`;
}

const SOCIAL_MAP: Record<string, string> = {
    twitter: 'simple-icons:x',
    x: 'simple-icons:x',
    github: 'simple-icons:github',
    linkedin: 'simple-icons:linkedin',
    website: 'lucide:globe',
};

/**
 * Map a social platform string to an iconify icon id.
 * Handles exact keys, substring matches (e.g. "Twitter / X"), and fallbacks.
 */
export function socialIconName(platform: string): string {
    const lower = platform.toLowerCase();
    // Exact match first
    if (SOCIAL_MAP[lower]) return SOCIAL_MAP[lower];
    // Substring match for compound values like "twitter / x"
    for (const [key, icon] of Object.entries(SOCIAL_MAP)) {
        if (lower.includes(key)) return icon;
    }
    return 'lucide:link';
}
