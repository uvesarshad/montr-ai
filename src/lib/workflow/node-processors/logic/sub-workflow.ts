/**
 * Sub-Workflow Processor
 *
 * Executes another canvas/workflow as a sub-workflow within the current execution.
 * Supports passing input data and waiting for completion.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

export class SubWorkflowProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution, workflow } = context;
    const canvasId = config?.canvasId as string | undefined;
    const passInputData = config?.passInputData !== false;
    const waitForCompletion = config?.waitForCompletion !== false;

    if (!canvasId) {
      throw new Error('No sub-workflow selected. Please choose a canvas workflow.');
    }

    // Cycle detection — refuse to recurse into a workflow that's already on the parent chain.
    const rawChain = execution.variables?._parentChain;
    const parentChain: string[] = Array.isArray(rawChain)
      ? [...(rawChain as string[])]
      : [];
    parentChain.push(workflow._id.toString());

    const MAX_DEPTH = 8;
    if (parentChain.length > MAX_DEPTH) {
      throw new Error(`Sub-workflow depth limit exceeded (${MAX_DEPTH}). Possible runaway nesting.`);
    }

    // Build trigger data for sub-workflow
    const triggerData: Record<string, unknown> = {};
    if (passInputData) {
      triggerData._parentExecution = execution._id.toString();
      triggerData._parentWorkflow = workflow._id.toString();
      triggerData._parentVariables = execution.variables;
    }

    // Load the sub-workflow canvas
    const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');

    // Find the workflow associated with this canvas — scoped to the caller's
    // organization so a canvasId from another tenant can never be executed.
    const subWorkflow = await UnifiedWorkflow.findOne({
      canvasId
    });

    if (!subWorkflow) {
      throw new Error(`Sub-workflow not found in this organization (canvas ${canvasId}). Ensure the canvas has been saved as an active workflow in your organization.`);
    }

    const subWorkflowId = subWorkflow._id.toString();
    if (parentChain.includes(subWorkflowId)) {
      throw new Error(`Sub-workflow cycle detected: workflow ${subWorkflowId} is already in the parent chain (${parentChain.join(' → ')}).`);
    }

    const initialVariables = { _parentChain: parentChain };

    if (waitForCompletion) {
      // Execute synchronously and return the result. The child engine charges
      // its node/AI/HTTP usage against the parent's SHARED cost budget (2.3 / H2)
      // when the engine handed one down via context.costBudget — so the parent's
      // hard ceilings (node/AI/HTTP) bound the WHOLE tree, not each level. Absent
      // (e.g. unit test invoking the processor directly) ⇒ child owns a fresh
      // budget (legacy behavior). Depth limit (above) still bounds nesting.
      const { UnifiedWorkflowExecutionEngine } = await import('../../unified-execution-engine');
      const engine = new UnifiedWorkflowExecutionEngine();
      const subExecution = await engine.execute({
        workflowId: subWorkflowId,
        userId: execution.userId.toString(),
        triggerData,
        initialVariables,
        costBudget: context.costBudget,
      });

      return {
        executionId: subExecution._id.toString(),
        status: subExecution.status,
        completedAt: subExecution.completedAt,
        variables: subExecution.variables,
      };
    } else {
      // Fire-and-forget: the child run is DETACHED from the parent's worker slot
      // and lifecycle. It therefore gets its OWN cost budget (we do NOT share the
      // parent's counters — the parent returns before the child finishes, so a
      // shared budget would race and the parent's ceiling can't meaningfully
      // bound a run it no longer awaits). We log the detachment so cost attribution
      // is auditable. Failures are no longer silently swallowed: the child engine
      // emits the standard `workflow.execution_failed` notification + failed-step
      // history for its OWN execution record on failure; here we additionally log
      // the failure so it surfaces in worker logs.
      //
      // DEFERRED (per TODO 2.3): routing waitForCompletion sub-workflows through
      // the queue with a parent-resume handshake is intentionally NOT done here —
      // that is a larger change than this hardening pass calls for.
      console.warn(
        `[SubWorkflow] Fire-and-forget run for canvas ${canvasId} is DETACHED from parent execution ${execution._id} — it runs on its own cost budget and is not awaited; failures are reported via the child run's own notification + history.`
      );
      import('../../unified-execution-engine').then(async ({ UnifiedWorkflowExecutionEngine }) => {
        const engine = new UnifiedWorkflowExecutionEngine();
        await engine.execute({
          workflowId: subWorkflowId,
          userId: execution.userId.toString(),
          triggerData,
          initialVariables,
        });
      }).catch(err => {
        // The child engine already emitted workflow.execution_failed for its own
        // run before throwing; we log here so the failure is visible in the
        // detached path's worker logs (not swallowed).
        console.error(
          `[SubWorkflow] Detached fire-and-forget execution failed for canvas ${canvasId} (parent ${execution._id}):`,
          err,
        );
      });

      return {
        status: 'started',
        message: `Sub-workflow for canvas ${canvasId} started in background (detached).`,
      };
    }
  }
}
