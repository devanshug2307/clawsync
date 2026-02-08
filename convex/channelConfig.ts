import { query, mutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

/**
 * Channel Configuration
 *
 * Manages messaging channel integrations (Telegram, WhatsApp, Slack, Discord, Email).
 * Secrets are stored separately in channelSecrets table.
 */

// Get all channel configs
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('channelConfig').take(50);
  },
});

// Get channel config by type
export const getByType = query({
  args: { channelType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('channelConfig')
      .withIndex('by_type', (q) => q.eq('channelType', args.channelType))
      .first();
  },
});

// Internal version for actions
export const getByTypeInternal = internalQuery({
  args: { channelType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('channelConfig')
      .withIndex('by_type', (q) => q.eq('channelType', args.channelType))
      .first();
  },
});

// Get enabled channels
export const getEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('channelConfig')
      .filter((q) => q.eq(q.field('enabled'), true))
      .take(50);
  },
});

// Create or update channel config
export const upsert = mutation({
  args: {
    channelType: v.string(),
    displayName: v.string(),
    enabled: v.optional(v.boolean()),
    rateLimitPerMinute: v.optional(v.number()),
    webhookUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('channelConfig')
      .withIndex('by_type', (q) => q.eq('channelType', args.channelType))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        enabled: args.enabled ?? existing.enabled,
        rateLimitPerMinute: args.rateLimitPerMinute ?? existing.rateLimitPerMinute,
        webhookUrl: args.webhookUrl ?? existing.webhookUrl,
        metadata: args.metadata ?? existing.metadata,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert('channelConfig', {
      channelType: args.channelType,
      displayName: args.displayName,
      enabled: args.enabled ?? false,
      rateLimitPerMinute: args.rateLimitPerMinute ?? 20,
      webhookUrl: args.webhookUrl,
      metadata: args.metadata,
      updatedAt: Date.now(),
    });
  },
});

// Toggle channel enabled status
export const toggle = mutation({
  args: { id: v.id('channelConfig') },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.id);
    if (!channel) throw new Error('Channel not found');

    await ctx.db.patch(args.id, {
      enabled: !channel.enabled,
      updatedAt: Date.now(),
    });
  },
});

// Delete channel config
export const remove = mutation({
  args: { id: v.id('channelConfig') },
  handler: async (ctx, args) => {
    // Also delete associated secrets
    const secrets = await ctx.db
      .query('channelSecrets')
      .withIndex('by_channel', (q) => q.eq('channelId', args.id))
      .collect();

    for (const secret of secrets) {
      await ctx.db.delete(secret._id);
    }

    await ctx.db.delete(args.id);
  },
});

// Seed default channel configs
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const channels = [
      { channelType: 'telegram', displayName: 'Telegram' },
      { channelType: 'whatsapp', displayName: 'WhatsApp' },
      { channelType: 'slack', displayName: 'Slack' },
      { channelType: 'discord', displayName: 'Discord' },
      { channelType: 'email', displayName: 'Email' },
    ];

    for (const channel of channels) {
      const existing = await ctx.db
        .query('channelConfig')
        .withIndex('by_type', (q) => q.eq('channelType', channel.channelType))
        .first();

      if (!existing) {
        await ctx.db.insert('channelConfig', {
          channelType: channel.channelType,
          displayName: channel.displayName,
          enabled: false,
          rateLimitPerMinute: 20,
          updatedAt: Date.now(),
        });
      }
    }
  },
});
