/**
 * Avatar utility functions for user profile management
 */

/**
 * Generates a consistent avatar index (0-24) based on user ID
 * Uses a simple hash function to ensure the same user always gets the same avatar
 */
export function generateAvatarIndex(userId: string): number {
    if (!userId) return 0;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const char = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Return a number between 0 and 24
    return Math.abs(hash) % 25;
}

/**
 * Returns the default avatar URL for a user based on their ID
 * If the user has a custom image, that should be used instead
 */
export function getDefaultAvatar(userId: string): string {
    const index = generateAvatarIndex(userId);
    return `/avatars/avatar-${index + 1}.png`;
}

/**
 * Gets the appropriate avatar URL for a user
 * Returns custom image if available, otherwise returns default avatar
 */
export function getUserAvatar(userId: string, customImage?: string | null): string {
    if (customImage) {
        return customImage;
    }
    return getDefaultAvatar(userId);
}
