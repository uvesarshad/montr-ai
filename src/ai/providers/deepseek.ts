/**
 * DeepSeek provider — OpenAI-compatible.
 *
 * Models:
 *  - `deepseek-chat`     — standard chat completion
 *  - `deepseek-reasoner` — long-thinking; emits `reasoning_content` separately
 *    from the final `content`. The provider prepends a `<think>...</think>`
 *    block to the assistant text so downstream callers can render or filter it.
 *
 * Endpoint: `api.deepseek.com/v1`.
 */

import { makeOpenAICompatibleProvider } from './_openai-compatible';

export const deepseekProvider = makeOpenAICompatibleProvider({
  id: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  toolCalling: true,
  vision: false,
  /**
   * For `deepseek-reasoner`, surface the model's chain-of-thought (`reasoning_content`)
   * wrapped in a `<think>` block before the final answer. UIs can hide or
   * style this section; programmatic callers can split on the tags.
   */
  extractExtraText: (message) => {
    const reasoning = (message as { reasoning_content?: string }).reasoning_content;
    if (!reasoning) return '';
    return `<think>\n${reasoning}\n</think>`;
  },
});
