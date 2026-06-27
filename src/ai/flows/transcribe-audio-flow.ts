'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';

const ApiKeysSchema = z.object({
  openai: z.string().optional(),
  deepseek: z.string().optional(),
  googleai: z.string().optional(),
}).optional();

const TranscribeAudioInputSchema = z.object({
  audioBase64: z.string().describe('The base64 encoded audio data.'),
  mimeType: z.string().describe('The mime type of the audio data (e.g. "audio/webm").'),
  userApiKeys: ApiKeysSchema.optional(),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  transcript: z.string().describe('The transcribed text.'),
});
export type TranscribeAudioOutput = z.infer<
  typeof TranscribeAudioOutputSchema
>;

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error("User not found");

  const userApiKeys = user.userApiKeys;

  console.log('\n========================================');
  console.log('🔧 STEP 1: transcribeAudio function called');
  console.log('========================================');
  console.log('📊 Input received:', {
    mimeType: input.mimeType,
    base64Length: input.audioBase64?.length || 0,
    base64Preview: input.audioBase64?.substring(0, 50) + '...',
    hasBase64: !!input.audioBase64,
  });

  try {
    const inputWithKeys = { ...input, userApiKeys: userApiKeys || input.userApiKeys };
    const result = await transcribeAudioFlow(inputWithKeys);
    console.log('✅ STEP 1 COMPLETE: Flow returned:', result);
    return result;
  } catch (error) {
    const err = error as { name?: string; message?: string; code?: string; stack?: string } | undefined;
    console.error('❌ STEP 1 FAILED:', {
      errorName: err?.name,
      errorMessage: err?.message,
      errorCode: err?.code,
      errorStack: err?.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2)
    });
    throw error;
  }
}

const transcribeAudioFlow = ai.defineFlow(
  {
    name: 'transcribeAudioFlow',
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async ({ audioBase64, mimeType, userApiKeys }) => {
    console.log('\n========================================');
    console.log('🌊 STEP 2: Flow execution started');
    console.log('========================================');

    // Step 2.1: Validate input
    console.log('📦 STEP 2.1: Validating input');
    if (!audioBase64 || audioBase64.length === 0) {
      console.error('❌ VALIDATION FAILED: Empty base64 data');
      throw new Error('Empty base64 audio data');
    }
    console.log('✅ Input validation passed');

    // Step 2.2: Check base64 format
    console.log('📦 STEP 2.2: Checking base64 format');
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    const isValidBase64 = base64Regex.test(audioBase64.substring(0, 100));
    console.log('Base64 appears valid:', isValidBase64);
    if (!isValidBase64) {
      console.error('❌ Invalid base64 format detected');
    }

    // Step 2.3: Construct data URI
    console.log('📦 STEP 2.3: Constructing data URI');
    const dataUri = `data:${mimeType};base64,${audioBase64}`;
    console.log('Data URI info:', {
      totalLength: dataUri.length,
      prefix: dataUri.substring(0, 100),
      estimatedFileSizeKB: Math.round((audioBase64.length * 0.75) / 1024),
    });

    // Step 2.4: Test AI configuration
    console.log('📦 STEP 2.4: Testing AI configuration');
    try {
      console.log('AI instance:', typeof ai);
      console.log('AI generate method:', typeof ai.generate);
    } catch (e) {
      console.error('❌ AI configuration issue:', e);
    }

    // Step 2.5: Call AI model
    console.log('\n🤖 STEP 2.5: Calling AI model');
    console.log('Model: gemini-2.0-flash');

    try {
      const generationOptions: { plugins?: unknown[] } = {};
      if (userApiKeys?.googleai) {
        console.log('Audio Transcription: Using user-provided Google AI key.');
        generationOptions.plugins = [googleAI({ apiKey: userApiKeys.googleai })];
      }

      const generateStartTime = Date.now();

      const result = await ai.generate({
        model: 'googleai/gemini-2.0-flash',
        prompt: [
          {
            text: 'Transcribe the following audio file accurately. If there is no speech, return an empty string.',
          },
          {
            media: {
              url: dataUri,
            },
          },
        ],
        ...generationOptions
      });

      const generateEndTime = Date.now();
      console.log(`⏱️ AI call took ${generateEndTime - generateStartTime}ms`);

      console.log('📦 STEP 2.6: Processing AI response');
      console.log('Raw result:', {
        hasText: !!result.text,
        textType: typeof result.text,
        textLength: result.text?.length || 0,
        textPreview: result.text?.substring(0, 100),
        fullResult: JSON.stringify(result, null, 2)
      });

      if (result.text === undefined || result.text === null) {
        console.error('❌ No text in AI response');
        throw new Error('Transcription failed to produce output.');
      }

      const transcript = result.text.trim();
      console.log('✅ STEP 2.6 COMPLETE: Final transcript:', {
        length: transcript.length,
        preview: transcript.substring(0, 100)
      });

      return { transcript };

    } catch (aiError) {
      const err = aiError as {
        name?: string;
        message?: string;
        code?: string;
        status?: number;
        statusText?: string;
        cause?: unknown;
        stack?: string;
      } | undefined;
      console.error('\n❌❌❌ AI GENERATION ERROR ❌❌❌');
      console.error('Error details:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        status: err?.status,
        statusText: err?.statusText,
        cause: err?.cause,
        stack: err?.stack,
        fullError: JSON.stringify(aiError, Object.getOwnPropertyNames(aiError as object), 2)
      });

      // Check for specific error types
      if (err?.message?.includes('NOT_FOUND')) {
        console.error('🔍 Model not found - check plugin configuration');
      }
      if (err?.message?.includes('API key')) {
        console.error('🔑 API key issue detected');
      }
      if (err?.message?.includes('quota')) {
        console.error('💰 Quota or billing issue');
      }

      throw new Error(`AI generation failed: ${err?.message ?? String(aiError)}`);
    }
  }
);
