import { Agent } from '@convex-dev/agent';
import { components } from '../_generated/api';
import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { openai } from '@ai-sdk/openai';
import { LanguageModelV1 } from '@ai-sdk/provider';

/**
 * ClawSync Agent Definition
 *
 * The agent is configured minimally here. Soul document, model config,
 * and tools are all loaded from Convex at runtime. This means SyncBoard
 * changes take effect on the next message without redeploying.
 *
 * Model selection is resolved dynamically via the chat.ts file which
 * passes the model to generateText. Tools are resolved via toolLoader.ts
 * 
 * Note: Text embeddings are disabled due to AI SDK version incompatibility.
 * Dynamic instructions are passed at generateText call time, not here.
 * 
 * Using @ai-sdk/google v2.0.52 for v2 model compatibility with AI SDK 5.
 */

/**
 * Helper to create the right model based on provider
 */
export function createModel(provider: string, modelId: string): LanguageModelV1 {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId);
    case 'openai':
      return openai(modelId);
    case 'google': {
      // Use GEMINI_API_KEY environment variable instead of default GOOGLE_GENERATIVE_AI_API_KEY
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      return google(modelId);
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
    case 'xai': {
      const xai = createOpenAICompatible({
        name: 'xai',
        baseURL: 'https://api.x.ai/v1',
      });
      return xai(modelId);
    }
    default:
      return anthropic('claude-sonnet-4-20250514');
  }
}

export const clawsyncAgent = new Agent(components.agent, {
  name: 'ClawSync Agent',
  // Default language model - can be overridden per-request via generateText({ model: ... })
  languageModel: anthropic('claude-sonnet-4-20250514'),
  // Static default instructions - can be overridden per-request via generateText({ system: ... })
  instructions: 'You are a helpful AI assistant.',
  // Tools are loaded dynamically - see toolLoader.ts
  tools: {},
});

// Export the agent for use in actions
export default clawsyncAgent;
