/**
 * Agent Session Manager
 * 
 * Manages isolated sessions per brand + user combination.
 * Persisted to MongoDB via AgentSession model for durability across server restarts.
 * Uses in-memory cache for fast reads, with write-through to MongoDB.
 */

import { CoreMessage } from 'ai';
import AgentSession from '@/lib/db/models/agent-session.model';

interface AgentSessionData {
    sessionId: string;
    userId: string;
    brandId: string;
    activeAgentId: string;
    history: CoreMessage[];
    metadata: {
        startedAt: Date;
        messageCount: number;
        lastActivityAt: Date;
        agentSwitchCount: number;
    };
}

// In-memory cache for fast access (write-through to MongoDB)
const cache = new Map<string, AgentSessionData>();

function sessionKey(userId: string, brandId: string): string {
    return `${userId}:${brandId}`;
}

/**
 * Get or create a session for a user + brand.
 * Checks in-memory cache first, then MongoDB, then creates new.
 */
export async function getSession(userId: string, brandId: string): Promise<AgentSessionData> {
    const key = sessionKey(userId, brandId);

    // Check cache
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }

    // Check MongoDB
    try {
        const dbSession = await AgentSession.findOne({ userId, brandId });
        if (dbSession) {
            const session: AgentSessionData = {
                sessionId: dbSession.sessionId,
                userId: dbSession.userId,
                brandId: dbSession.brandId,
                activeAgentId: dbSession.activeAgentId,
                history: dbSession.history,
                metadata: {
                    startedAt: dbSession.createdAt,
                    messageCount: dbSession.messageCount,
                    lastActivityAt: dbSession.lastActivityAt,
                    agentSwitchCount: dbSession.agentSwitchCount,
                },
            };
            cache.set(key, session);
            return session;
        }
    } catch (error) {
        // MongoDB might not be connected yet, fall through to create new
        console.warn('[SessionManager] MongoDB read failed, creating in-memory session:', (error as Error).message);
    }

    // Create new session
    const session: AgentSessionData = {
        sessionId: `session-${userId}-${brandId}-${Date.now()}`,
        userId,
        brandId,
        activeAgentId: 'general-agent',
        history: [],
        metadata: {
            startedAt: new Date(),
            messageCount: 0,
            lastActivityAt: new Date(),
            agentSwitchCount: 0,
        },
    };
    cache.set(key, session);

    // Persist to MongoDB (fire-and-forget)
    AgentSession.create({
        sessionId: session.sessionId,
        userId,
        brandId,
        activeAgentId: 'general-agent',
        history: [],
        messageCount: 0,
        agentSwitchCount: 0,
        lastActivityAt: new Date(),
    }).catch(err => console.warn('[SessionManager] MongoDB create failed:', err.message));

    return session;
}

/**
 * Update session after a message exchange.
 * Writes through to both cache and MongoDB.
 */
export async function updateSession(
    userId: string,
    brandId: string,
    newMessages: CoreMessage[],
    activeAgentId?: string
): Promise<void> {
    const session = await getSession(userId, brandId);

    session.history.push(...newMessages);
    session.metadata.messageCount += newMessages.length;
    session.metadata.lastActivityAt = new Date();

    if (activeAgentId && activeAgentId !== session.activeAgentId) {
        session.activeAgentId = activeAgentId;
        session.metadata.agentSwitchCount++;
    }

    // Keep history manageable (last 50 messages)
    if (session.history.length > 50) {
        session.history = session.history.slice(-50);
    }

    cache.set(sessionKey(userId, brandId), session);

    // Write-through to MongoDB (fire-and-forget)
    AgentSession.findOneAndUpdate(
        { userId, brandId },
        {
            activeAgentId: session.activeAgentId,
            history: session.history,
            messageCount: session.metadata.messageCount,
            agentSwitchCount: session.metadata.agentSwitchCount,
            lastActivityAt: session.metadata.lastActivityAt,
        },
        { upsert: true }
    ).catch(err => console.warn('[SessionManager] MongoDB update failed:', err.message));
}

/**
 * Clear a session (e.g., when user starts a new conversation).
 */
export async function clearSession(userId: string, brandId: string): Promise<void> {
    cache.delete(sessionKey(userId, brandId));
    AgentSession.deleteOne({ userId, brandId })
        .catch(err => console.warn('[SessionManager] MongoDB delete failed:', err.message));
}

/**
 * Get session stats for monitoring.
 */
export function getSessionStats(): {
    activeSessions: number;
    totalMessages: number;
} {
    let totalMessages = 0;
    for (const session of cache.values()) {
        totalMessages += session.metadata.messageCount;
    }
    return { activeSessions: cache.size, totalMessages };
}
