import { internalQuery, internalMutation } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Voice Provider Queries and Mutations
 *
 * These functions run in Convex runtime, not Node.js.
 * Actions are in providers.ts with 'use node'.
 */

// Get the default voice provider
export const getDefaultProvider = internalQuery({
    args: {},
    handler: async (ctx) => {
        const provider = await ctx.db
            .query('voiceProviders')
            .filter((q) => q.eq(q.field('isDefault'), true))
            .first();

        if (!provider) {
            // Fallback to first enabled provider
            return await ctx.db
                .query('voiceProviders')
                .filter((q) => q.eq(q.field('enabled'), true))
                .first();
        }

        return provider;
    },
});

// Get provider by ID
export const getProvider = internalQuery({
    args: {
        providerId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('voiceProviders')
            .withIndex('by_provider', (q) => q.eq('providerId', args.providerId))
            .first();
    },
});

// List all voice providers
export const listProviders = internalQuery({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query('voiceProviders').collect();
    },
});

// Create voice session
export const createSession = internalMutation({
    args: {
        providerId: v.string(),
        voiceId: v.optional(v.string()),
        threadId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const sessionId = crypto.randomUUID();

        await ctx.db.insert('voiceSessions', {
            sessionId,
            threadId: args.threadId,
            providerId: args.providerId,
            voiceId: args.voiceId,
            status: 'active',
            durationSecs: 0,
            startedAt: Date.now(),
        });

        return { sessionId };
    },
});

// End voice session
export const endSession = internalMutation({
    args: {
        sessionId: v.string(),
        durationSecs: v.number(),
        tokensUsed: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query('voiceSessions')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
            .first();

        if (!session) {
            throw new Error('Session not found');
        }

        await ctx.db.patch(session._id, {
            status: 'ended',
            durationSecs: args.durationSecs,
            tokensUsed: args.tokensUsed,
            endedAt: Date.now(),
        });
    },
});
