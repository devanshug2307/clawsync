'use node';

import { action, internalAction } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { clawsyncAgent, createModel } from './agent/clawsync';
import { rateLimiter } from './rateLimits';
import { tool } from 'ai';
import { z } from 'zod';


/**
 * Chat Functions
 *
 * Handles sending messages to the agent and receiving responses.
 * Uses @convex-dev/agent for thread management and streaming.
 */

// Send a message and get a response
export const send = action({
  args: {
    threadId: v.optional(v.string()),
    message: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Rate limit check
    const { ok } = await rateLimiter.limit(ctx, 'publicChat', {
      key: args.sessionId,
    });

    if (!ok) {
      return {
        error: 'Rate limit exceeded. Please wait before sending another message.',
        threadId: args.threadId,
      };
    }

    // Global rate limit
    const { ok: globalOk } = await rateLimiter.limit(ctx, 'globalMessages', {
      key: 'global',
    });

    if (!globalOk) {
      return {
        error: 'The agent is currently busy. Please try again in a moment.',
        threadId: args.threadId,
      };
    }

    // Validate message length
    const maxLength = 4000;
    if (args.message.length > maxLength) {
      return {
        error: `Message too long. Maximum ${maxLength} characters.`,
        threadId: args.threadId,
      };
    }

    try {
      // Get agent config to resolve the model
      const config = await ctx.runQuery(internal.agentConfig.getConfig);

      // Create the dynamic model based on config
      const model = config
        ? createModel(config.modelProvider, config.model)
        : undefined; // Use default if no config

      // Create or continue thread
      let threadId: string;
      let thread;

      if (args.threadId) {
        const result = await clawsyncAgent.continueThread(ctx, { threadId: args.threadId });
        thread = result.thread;
        threadId = args.threadId;
      } else {
        const result = await clawsyncAgent.createThread(ctx, {});
        thread = result.thread;
        threadId = result.threadId;
      }

      // Build dynamic system instructions from config
      let systemInstructions = 'You are a helpful AI assistant.';
      if (config) {
        const parts = [];
        if (config.soulDocument) parts.push(config.soulDocument);
        if (config.systemPrompt) parts.push(config.systemPrompt);
        if (parts.length > 0) {
          systemInstructions = parts.join('\n\n');
        }
      }

      // Add analytics instructions if GA is configured
      if (process.env.GA4_PROPERTY_ID) {
        systemInstructions += '\n\nYou have access to Google Analytics data via the getAnalytics tool. When users ask about website analytics, traffic, pageviews, top pages, traffic sources, devices, or performance, call getAnalytics. After getting the data, present it to the user in a clear format.';
      }

      // Variable to capture tool result
      let lastToolResult: string | null = null;

      // Create the analytics tool if GA is configured
      const analyticsTools = process.env.GA4_PROPERTY_ID ? {
        getAnalytics: tool({
          description: 'Get Google Analytics data. Call this tool when users ask about website traffic, pageviews, top pages, traffic sources, devices, or countries.',
          parameters: z.object({
            query: z.string().optional().describe('Optional: specific analytics query like "top pages" or "traffic sources"'),
          }),
          execute: async (toolArgs: { query?: string }): Promise<string> => {
            try {
              // Use provided query or fall back to a sensible default based on user's message
              const queryValue = toolArgs?.query || args.message || 'overview';
              console.log('GA Tool: Using query:', queryValue);

              const result = await ctx.runAction(internal.analytics.queryAnalytics, { query: queryValue });
              console.log('GA Tool: Got result, length:', result?.length);

              // Store the result so we can use it if generateText doesn't return text
              lastToolResult = result;

              return result;
            } catch (error) {
              console.error('GA Tool error:', error);
              const errorMsg = `Error fetching analytics: ${String(error)}`;
              lastToolResult = errorMsg;
              return errorMsg;
            }
          },
        }),
      } : undefined;

      // Generate response with dynamic model, instructions, and tools
      const generateResult = await thread.generateText({
        prompt: args.message,
        model, // Pass the resolved model (undefined uses agent default)
        system: systemInstructions, // Dynamic instructions from config
        tools: analyticsTools, // GA analytics tool if configured
      });

      // Use the AI's response, or fall back to the tool result if available
      let responseText = generateResult.text;
      if (!responseText && lastToolResult) {
        console.log('send: Using lastToolResult as fallback');
        responseText = lastToolResult;
      }

      // Log activity
      await ctx.runMutation(internal.activityLog.log, {
        actionType: 'chat_message',
        summary: `Responded to: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}"`,
        visibility: 'private',
      });

      return {
        response: responseText,
        threadId,
      };
    } catch (error) {
      console.error('Chat error:', error);
      return {
        error: 'Failed to generate response. Please try again.',
        threadId: args.threadId,
      };
    }
  },
});

// Internal version for channel integrations (Telegram, WhatsApp, etc.)
export const sendInternal = internalAction({
  args: {
    message: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<{ response?: string; error?: string }> => {
    try {
      // Get agent config to resolve the model
      const config = await ctx.runQuery(internal.agentConfig.getConfig);

      // Create the dynamic model based on config
      const model = config
        ? createModel(config.modelProvider, config.model)
        : undefined;

      // Create a new thread for each channel message
      const { thread } = await clawsyncAgent.createThread(ctx, {});

      // Build dynamic system instructions from config
      let systemInstructions = 'You are a helpful AI assistant.';
      if (config) {
        const parts = [];
        if (config.soulDocument) parts.push(config.soulDocument);
        if (config.systemPrompt) parts.push(config.systemPrompt);
        if (parts.length > 0) {
          systemInstructions = parts.join('\n\n');
        }
      }

      // Add analytics instructions if GA is configured
      if (process.env.GA4_PROPERTY_ID) {
        systemInstructions += '\n\nYou have access to Google Analytics data via the getAnalytics tool. When users ask about website analytics, traffic, pageviews, top pages, traffic sources, devices, or performance, call getAnalytics. After getting the data, present it to the user.';
      }

      // Variable to capture tool result
      let lastToolResult: string | null = null;

      // Create the analytics tool if GA is configured
      const analyticsTools = process.env.GA4_PROPERTY_ID ? {
        getAnalytics: tool({
          description: 'Get Google Analytics data. Call this tool when users ask about website traffic, pageviews, top pages, traffic sources, devices, or countries.',
          parameters: z.object({
            query: z.string().optional().describe('Optional: specific analytics query'),
          }),
          execute: async (toolArgs: { query?: string }): Promise<string> => {
            try {
              // Use provided query or fall back to user's original message
              const queryValue = toolArgs?.query || args.message || 'overview';
              console.log('GA Tool (Internal): Using query:', queryValue);

              const result = await ctx.runAction(internal.analytics.queryAnalytics, { query: queryValue });
              console.log('GA Tool (Internal): Got result, length:', result?.length);

              // Store the result for fallback
              lastToolResult = result;

              return result;
            } catch (error) {
              console.error('GA Tool error:', error);
              const errorMsg = `Error fetching analytics: ${String(error)}`;
              lastToolResult = errorMsg;
              return errorMsg;
            }
          },
        }),
      } : undefined;

      // Generate response with analytics tool
      const generateResult = await thread.generateText({
        prompt: args.message,
        model,
        system: systemInstructions,
        tools: analyticsTools,
      });

      // Debug: Log the entire generateResult structure
      console.log('sendInternal generateResult structure:', JSON.stringify({
        hasText: !!generateResult.text,
        textLength: generateResult.text?.length || 0,
        textPreview: generateResult.text?.substring(0, 100) || 'none',
        hasToolCalls: !!generateResult.toolCalls,
        toolCallsCount: generateResult.toolCalls?.length || 0,
        hasToolResults: !!generateResult.toolResults,
        toolResultsCount: generateResult.toolResults?.length || 0,
      }));

      // Use the AI's response, or fall back to the captured tool result
      let responseText = generateResult.text;

      if (!responseText && lastToolResult) {
        console.log('sendInternal: Using lastToolResult as fallback');
        responseText = lastToolResult;
      }

      // Final fallback
      if (!responseText) {
        responseText = 'I processed your request but couldn\'t generate a response.';
      }

      console.log('sendInternal final response preview:', responseText?.substring(0, 100));
      return { response: responseText };
    } catch (error) {
      console.error('Internal chat error:', error);
      return { error: 'Failed to generate response. Please try again.' };
    }
  },
});

// Stream a response (for real-time output)
export const stream = internalAction({
  args: {
    threadId: v.optional(v.string()),
    message: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    // Rate limit check
    const { ok } = await rateLimiter.limit(ctx, 'publicChat', {
      key: args.sessionId,
    });

    if (!ok) {
      throw new Error('Rate limit exceeded');
    }

    const thread = args.threadId
      ? await clawsyncAgent.continueThread(ctx, { threadId: args.threadId })
      : await clawsyncAgent.createThread(ctx, {});

    // Use streaming generation
    const result = await thread.generateText({
      prompt: args.message,
    });

    return {
      response: result.text,
      threadId: thread.threadId,
    };
  },
});

// Get thread history
export const getHistory = action({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const messages = await clawsyncAgent.listMessages(ctx, {
        threadId: args.threadId,
      });

      return { messages };
    } catch {
      return { messages: [] };
    }
  },
});

// API Send - Internal action for HTTP API
export const apiSend = internalAction({
  args: {
    message: v.string(),
    threadId: v.optional(v.string()),
    sessionId: v.string(),
    apiKeyId: v.optional(v.id('apiKeys')),
  },
  handler: async (ctx, args) => {
    // Validate message length
    const maxLength = 4000;
    if (args.message.length > maxLength) {
      return {
        error: `Message too long. Maximum ${maxLength} characters.`,
        threadId: args.threadId,
      };
    }

    try {
      // Create or continue thread
      const thread = args.threadId
        ? await clawsyncAgent.continueThread(ctx, { threadId: args.threadId })
        : await clawsyncAgent.createThread(ctx, {});

      // Generate response
      const result = await thread.generateText({
        prompt: args.message,
      });

      // Log activity
      await ctx.runMutation(internal.activityLog.log, {
        actionType: 'api_chat',
        summary: `API: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}"`,
        visibility: 'private',
        channel: 'api',
      });

      // Get token usage from result if available
      const usage = (result as any).usage ?? {};

      return {
        response: result.text,
        threadId: thread.threadId,
        tokensUsed: (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
        inputTokens: usage.promptTokens ?? 0,
        outputTokens: usage.completionTokens ?? 0,
      };
    } catch (error) {
      console.error('API Chat error:', error);
      return {
        error: 'Failed to generate response. Please try again.',
        threadId: args.threadId,
      };
    }
  },
});
