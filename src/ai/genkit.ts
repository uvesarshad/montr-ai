
// @ts-expect-error - GenkitPlugin export not declared in genkit's types
import {genkit, GenkitPlugin} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {openAI} from 'genkitx-openai';
import {config} from 'dotenv';

config();

const plugins: GenkitPlugin[] = [];

// These plugins are for system-level fallback if no user key is provided.
// The actual client used is determined in `src/ai/client.ts`.
if (process.env.GEMINI_API_KEY) {
  plugins.push(googleAI({apiKey: process.env.GEMINI_API_KEY}));
}
if (process.env.OPENAI_API_KEY) {
  plugins.push(openAI({apiKey: process.env.OPENAI_API_KEY}));
}

export const ai = genkit({
  plugins,
});
