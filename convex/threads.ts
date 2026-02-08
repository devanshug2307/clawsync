import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import { v } from 'convex/values';

/**
 * Thread Management
 *
 * Manages conversation threads for the API.
 * Uses @convex-dev/agent for thread storage.
 */

// List threads (internal - for API)
export const list = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get threads from agent's thread table
    const threads = await ctx.db
      .query('agent_threads')
      .order('desc')
      .take(args.limit ?? 20);

    return threads.map((t) => ({
      threadId: t._id,
      createdAt: t._creationTime,
      metadata: t.metadata,
    }));
  },
});

// Get messages for a thread (internal - for API)
export const getMessages = internalQuery({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get messages from agent's messages table
    const messages = await ctx.db
      .query('agent_messages')
      .filter((q) => q.eq(q.field('threadId'), args.threadId))
      .order('asc')
      .take(100);

    return messages.map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      createdAt: m._creationTime,
    }));
  },
});

// Create a new thread (internal - for API)
export const create = internalMutation({
  args: {
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Insert a new thread record
    const threadId = await ctx.db.insert('agent_threads' as any, {
      metadata: args.metadata ?? {},
      status: 'active',
    });

    return {
      threadId: threadId.toString(),
    };
  },
});

// Public query to list threads (for SyncBoard)
export const listPublic = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const threads = await ctx.db
        .query('agent_threads')
        .order('desc')
        .take(args.limit ?? 20);

      return threads.map((t) => ({
        threadId: t._id,
        createdAt: t._creationTime,
        metadata: t.metadata,
      }));
    } catch {
      // Table might not exist yet
      return [];
    }
  },
});

// Get thread by ID
export const get = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const thread = await ctx.db.get(args.threadId as any);
      if (!thread) return null;

      return {
        threadId: thread._id,
        createdAt: thread._creationTime,
        metadata: thread.metadata,
      };
    } catch {
      return null;
    }
  },
});

// Get thread messages (public - for SyncBoard)
export const getThreadMessages = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const messages = await ctx.db
        .query('agent_messages')
        .filter((q) => q.eq(q.field('threadId'), args.threadId))
        .order('asc')
        .take(100);

      return messages.map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        createdAt: m._creationTime,
      }));
    } catch {
      return [];
    }
  },
});

// Delete a thread
export const remove = mutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete messages first
    const messages = await ctx.db
      .query('agent_messages')
      .filter((q) => q.eq(q.field('threadId'), args.threadId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete thread
    await ctx.db.delete(args.threadId as any);
  },
});
