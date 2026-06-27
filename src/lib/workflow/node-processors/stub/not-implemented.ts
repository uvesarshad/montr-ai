/**
 * NotImplementedProcessor
 *
 * Placeholder for canvas node types that are surfaced in the palette but do
 * not yet have a real backend processor. Throws a deterministic, user-readable
 * error so the canvas execution UI can show a clear "this node is not yet
 * supported" message instead of crashing on a missing-processor stack trace.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

export class NotImplementedProcessor implements NodeProcessor {
  constructor(private readonly nodeLabel: string) {}

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { node } = context;
    throw new Error(
      `"${this.nodeLabel}" (subType: ${node.subType}) is on the canvas palette but its server-side processor is not implemented yet. ` +
        `Skip this node or remove it before running the automation.`
    );
  }
}
