import { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LanguageModelV1 } from 'ai';

/**
 * Model Router
 *
 * Resolves which AI SDK provider and model to use based on agentConfig.
 *
 * Provider mapping:
 * - anthropic: @ai-sdk/anthropic (direct API)
 * - openai: @ai-sdk/openai (direct API)
 * - google: @ai-sdk/google (Gemini models via Google AI Studio)
 * - openrouter: @ai-sdk/openai-compatible (https://openrouter.ai/api/v1)
 * - opencode-zen: @ai-sdk/openai-compatible (https://opencode.ai/zen/v1)
 * - custom: @ai-sdk/openai-compatible (user-provided base URL)
 */

export interface ModelConfig {
  provider: string;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
}

export interface ResolvedModel {
  model: LanguageModelV1;
  provider: string;
  modelId: string;
  isFallback: boolean;
}

/**
 * Resolve the model to use for the agent
 */
export async function resolveModel(ctx: ActionCtx): Promise<ResolvedModel> {
  // Get config from Convex
  const config = await ctx.runQuery(internal.agentConfig.getConfig);

  if (!config) {
    // Default to Claude Sonnet if no config
    return {
      model: anthropic('claude-sonnet-4-20250514'),
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      isFallback: false,
    };
  }

  try {
    // Try primary model
    const model = createModel(config.modelProvider, config.model);
    return {
      model,
      provider: config.modelProvider,
      modelId: config.model,
      isFallback: false,
    };
  } catch {
    // Try fallback if available
    if (config.fallbackProvider && config.fallbackModel) {
      const fallbackModel = createModel(config.fallbackProvider, config.fallbackModel);
      return {
        model: fallbackModel,
        provider: config.fallbackProvider,
        modelId: config.fallbackModel,
        isFallback: true,
      };
    }

    // Default fallback
    return {
      model: anthropic('claude-sonnet-4-20250514'),
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      isFallback: true,
    };
  }
}

/**
 * Create an AI SDK model instance from provider and model ID
 * 
 * Gemini Model IDs (use with 'google' provider):
 * - gemini-2.0-flash-exp (fast, good for most tasks)
 * - gemini-1.5-pro (advanced reasoning)
 * - gemini-1.5-flash (balanced)
 * - gemini-3-flash-preview (latest flash)
 * - gemini-3-pro-preview (latest pro)
 */
function createModel(provider: string, modelId: string): LanguageModelV1 {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId);

    case 'openai':
      return openai(modelId);

    case 'google': {
      // Native Google AI (Gemini) support
      // Uses GEMINI_API_KEY env var in Convex
      const gemini = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      return gemini(modelId);
    }

    case 'openrouter': {
      const openrouter = createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://clawsync.dev',
          'X-Title': 'ClawSync',
        },
      });
      return openrouter(modelId);
    }

    case 'opencode-zen': {
      const opencodeZen = createOpenAICompatible({
        name: 'opencode-zen',
        baseURL: 'https://opencode.ai/zen/v1',
      });
      return opencodeZen(modelId);
    }

    case 'custom': {
      // For custom providers, the modelId should include the base URL
      // Format: "baseUrl::modelId"
      const [baseUrl, actualModelId] = modelId.split('::');
      const customProvider = createOpenAICompatible({
        name: 'custom',
        baseURL: baseUrl,
      });
      return customProvider(actualModelId);
    }

    default:
      // Default to Anthropic
      return anthropic(modelId);
  }
}

/**
 * Get available model providers
 */
export function getAvailableProviders(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return [
    {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Claude models via direct API',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'GPT models via direct API',
    },
    {
      id: 'google',
      name: 'Google AI (Gemini)',
      description: 'Gemini models via Google AI Studio',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Access 300+ models via unified API',
    },
    {
      id: 'opencode-zen',
      name: 'OpenCode Zen',
      description: 'Curated, tested models',
    },
    {
      id: 'custom',
      name: 'Custom Provider',
      description: 'Any OpenAI-compatible API',
    },
  ];
}
