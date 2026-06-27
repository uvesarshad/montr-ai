/**
 * Data Passthrough Processor
 *
 * For canvas "input" nodes (text_input, image_input, file_input, …) the user
 * configures a literal value in the editor; at execution time we simply emit
 * that value as the node's output so downstream nodes can reference it via
 * `{{$nodeId.value}}` etc.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

export class DataPassthroughProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;

    // Common input shapes the canvas dialogs produce
    const value =
      config?.value ??
      config?.text ??
      config?.url ??
      config?.imageUrl ??
      config?.fileUrl ??
      null;

    return {
      value,
      files: config?.files ?? undefined,
      meta: {
        kind: config?.kind || 'data_input',
      },
    };
  }
}
