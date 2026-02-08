'use node';

import { internalAction, action } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

/**
 * Telegram Bot Integration
 * 
 * Handles incoming Telegram messages and sends responses via the Telegram Bot API.
 * 
 * Required environment variables:
 * - TELEGRAM_BOT_TOKEN: Your Telegram bot token from @BotFather
 * - TELEGRAM_WEBHOOK_SECRET: Optional secret for webhook verification
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Telegram message types
interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from: {
            id: number;
            is_bot: boolean;
            first_name: string;
            last_name?: string;
            username?: string;
        };
        chat: {
            id: number;
            type: 'private' | 'group' | 'supergroup' | 'channel';
            title?: string;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
        date: number;
        text?: string;
    };
}

/**
 * Send a message via Telegram Bot API
 */
export const sendMessage = internalAction({
    args: {
        chatId: v.number(),
        text: v.string(),
        replyToMessageId: v.optional(v.number()),
    },
    handler: async (_, args): Promise<boolean> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            console.error('TELEGRAM_BOT_TOKEN is not set');
            return false;
        }

        try {
            const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: args.chatId,
                    text: args.text,
                    reply_to_message_id: args.replyToMessageId,
                    parse_mode: 'Markdown',
                }),
            });

            const data = await response.json();
            if (!data.ok) {
                console.error('Telegram API error:', data);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
            return false;
        }
    },
});

/**
 * Send "typing" indicator to show the bot is responding
 */
export const sendTypingIndicator = internalAction({
    args: {
        chatId: v.number(),
    },
    handler: async (_, args): Promise<void> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return;

        await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: args.chatId,
                action: 'typing',
            }),
        });
    },
});

/**
 * Process an incoming Telegram message
 */
export const processMessage = internalAction({
    args: {
        chatId: v.number(),
        messageId: v.number(),
        text: v.string(),
        userId: v.number(),
        username: v.optional(v.string()),
        firstName: v.string(),
    },
    handler: async (ctx, args): Promise<void> => {
        try {
            // Show typing indicator
            await ctx.runAction(internal.telegram.sendTypingIndicator, {
                chatId: args.chatId,
            });

            // Check if Telegram channel is enabled
            const channelConfig = await ctx.runQuery(internal.channelConfig.getByTypeInternal, {
                channelType: 'telegram',
            });

            if (!channelConfig?.enabled) {
                await ctx.runAction(internal.telegram.sendMessage, {
                    chatId: args.chatId,
                    text: '🔒 This bot is currently disabled. Please contact the administrator.',
                    replyToMessageId: args.messageId,
                });
                return;
            }

            // Handle /start command
            if (args.text === '/start') {
                await ctx.runAction(internal.telegram.sendMessage, {
                    chatId: args.chatId,
                    text: `👋 Hello ${args.firstName}! I'm your AI assistant.\n\nYou can ask me anything!\n\nUse /help to see available commands.`,
                    replyToMessageId: args.messageId,
                });
                return;
            }

            // Handle /help command
            if (args.text === '/help') {
                await ctx.runAction(internal.telegram.sendMessage, {
                    chatId: args.chatId,
                    text: `📚 *Available Commands*\n\n/start - Start the bot\n/help - Show this help message\n\nOr just send me any message and I'll respond!`,
                    replyToMessageId: args.messageId,
                });
                return;
            }

            // Generate AI response using the same chat logic
            // Create a session ID based on Telegram chat ID
            const sessionId = `telegram_${args.chatId}`;

            // Use the chat action to generate response
            const result = await ctx.runAction(internal.chat.sendInternal, {
                message: args.text,
                sessionId,
            });

            if (result.error) {
                await ctx.runAction(internal.telegram.sendMessage, {
                    chatId: args.chatId,
                    text: `❌ Sorry, I encountered an error: ${result.error}`,
                    replyToMessageId: args.messageId,
                });
                return;
            }

            // Send the AI response
            await ctx.runAction(internal.telegram.sendMessage, {
                chatId: args.chatId,
                text: result.response || 'I apologize, but I couldn\'t generate a response.',
                replyToMessageId: args.messageId,
            });

            // Log activity
            await ctx.runMutation(internal.activityLog.log, {
                actionType: 'telegram_message',
                summary: `Telegram: ${args.firstName} (@${args.username || 'no_username'}): "${args.text.slice(0, 50)}${args.text.length > 50 ? '...' : ''}"`,
                visibility: 'public',
            });

        } catch (error) {
            console.error('Error processing Telegram message:', error);
            await ctx.runAction(internal.telegram.sendMessage, {
                chatId: args.chatId,
                text: '❌ Sorry, something went wrong. Please try again.',
                replyToMessageId: args.messageId,
            });
        }
    },
});

/**
 * Handle incoming webhook from Telegram
 */
export const handleWebhook = internalAction({
    args: {
        body: v.string(),
        secretToken: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
        // Verify webhook secret if configured
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (webhookSecret && args.secretToken !== webhookSecret) {
            console.warn('Invalid Telegram webhook secret');
            return { ok: false, error: 'Invalid secret token' };
        }

        try {
            const update: TelegramUpdate = JSON.parse(args.body);

            // Only handle text messages for now
            if (!update.message?.text) {
                return { ok: true };
            }

            const { message } = update;

            // Process the message
            await ctx.runAction(internal.telegram.processMessage, {
                chatId: message.chat.id,
                messageId: message.message_id,
                text: message.text || '',
                userId: message.from.id,
                username: message.from.username,
                firstName: message.from.first_name,
            });

            return { ok: true };
        } catch (error) {
            console.error('Error handling Telegram webhook:', error);
            return { ok: false, error: String(error) };
        }
    },
});

/**
 * Set up the Telegram webhook URL
 */
export const setupWebhook = action({
    args: {
        webhookUrl: v.string(),
    },
    handler: async (_, args): Promise<{ ok: boolean; error?: string }> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
        }

        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

        try {
            const response = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: args.webhookUrl,
                    secret_token: webhookSecret,
                    allowed_updates: ['message'],
                }),
            });

            const data = await response.json();
            if (!data.ok) {
                return { ok: false, error: data.description };
            }

            return { ok: true };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    },
});

/**
 * Get bot info to verify token is correct
 */
export const getMe = action({
    args: {},
    handler: async (): Promise<{ ok: boolean; username?: string; error?: string }> => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
        }

        try {
            const response = await fetch(`${TELEGRAM_API}${token}/getMe`);
            const data = await response.json();

            if (!data.ok) {
                return { ok: false, error: data.description };
            }

            return { ok: true, username: data.result.username };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    },
});
