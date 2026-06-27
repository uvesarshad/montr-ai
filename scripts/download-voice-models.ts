/**
 * Pre-fetch voice ML model assets so the voice worker can run offline.
 *
 *   npx tsx scripts/download-voice-models.ts
 *
 * - Silero VAD (`silero_vad.onnx`) is committed in the repo (small); this script
 *   just verifies it's present.
 * - The EOU turn-detector model (`model_q8.onnx`, ~65 MB) is NOT committed — it's
 *   downloaded here (sha256-verified) so production/CI/Docker images don't have
 *   to fetch it on first call. The tokenizer is committed alongside it.
 *
 * Run this in your image build / deploy step. Idempotent.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

import { EouSession } from '../src/lib/voice/ai/turn/eou-session';

async function main() {
  const root = process.cwd();
  const vad = path.join(root, 'src/lib/voice/ai/vad/models/silero_vad.onnx');
  console.log(
    fs.existsSync(vad)
      ? `[models] Silero VAD present (${(fs.statSync(vad).size / 1e6).toFixed(1)} MB).`
      : '[models] WARNING: Silero VAD model missing at ' + vad,
  );

  console.log('[models] Ensuring EOU turn-detector model (downloads ~65 MB if absent)…');
  const ok = await new EouSession().load();
  const model = process.env.VOICE_EOU_MODEL_PATH
    ?? path.join(root, 'src/lib/voice/ai/turn/models/model_q8.onnx');
  if (ok && fs.existsSync(model)) {
    console.log(`[models] EOU model ready (${(fs.statSync(model).size / 1e6).toFixed(1)} MB).`);
    process.exit(0);
  }
  console.error('[models] EOU model could not be prepared — semantic turn detection will fall back to the heuristic.');
  process.exit(1);
}

main().catch((err) => {
  console.error('[models] Fatal:', err);
  process.exit(1);
});
