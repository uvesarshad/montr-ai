/**
 * Smart Router Node Processor
 *
 * Evaluates multiple route conditions (supports natural language)
 * and returns the matching branch ID for edge routing.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { runMeteredWorkflowAI } from '../../metered-ai';

interface RouteEntry {
  id: string;
  condition: string;
  label: string;
}

export class SmartRouterProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, variableResolver } = context;
    const routes: RouteEntry[] = (config.routes as RouteEntry[] | undefined) || [];

    if (routes.length === 0) {
      return { branch: 'otherwise', matchedRoute: null };
    }

    // Check if any route has a natural language condition
    const hasNLPConditions = routes.some(r =>
      r.condition && !r.condition.match(/^[a-zA-Z0-9_.]+\s*(===|!==|==|!=|>|<|>=|<=)\s*/)
    );

    if (hasNLPConditions) {
      // Use AI to evaluate conditions
      return await this.evaluateWithAI(routes, context);
    }

    // Evaluate programmatic conditions
    for (const route of routes) {
      if (!route.condition) continue;
      try {
        const result = variableResolver.evaluateExpression(route.condition);
        if (result) {
          return {
            branch: route.id,
            matchedRoute: route.label,
            condition: route.condition,
          };
        }
      } catch (error) {
        console.warn(`Smart Router: Failed to evaluate condition "${route.condition}":`, error);
      }
    }

    return { branch: 'otherwise', matchedRoute: 'otherwise' };
  }

  private async evaluateWithAI(routes: RouteEntry[], context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { variableResolver } = context;
    const routeDescriptions = routes
      .map((r, i) => `Route ${i + 1} (id: "${r.id}", label: "${r.label}"): ${r.condition}`)
      .join('\n');

    const systemPrompt = `You are a workflow routing engine. Evaluate the given conditions against the context and determine which route matches.
Output ONLY a JSON object: {"matchedRouteId": "route_id_or_otherwise", "reason": "brief reason"}
If no route matches, use "otherwise".`;

    const userPrompt = `Context:
${JSON.stringify(variableResolver.context, null, 2)}

Routes:
${routeDescriptions}

Which route matches the current context?`;

    try {
      const { text } = await runMeteredWorkflowAI(context, {
        model: 'openai/gpt-4o-mini',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      const result = JSON.parse(cleaned);
      const matchedId = result.matchedRouteId || 'otherwise';
      const matchedRoute = routes.find(r => r.id === matchedId);

      return {
        branch: matchedId,
        matchedRoute: matchedRoute?.label || 'otherwise',
        reason: result.reason,
      };
    } catch (error) {
      console.error('Smart Router AI evaluation failed:', error);
      return { branch: 'otherwise', matchedRoute: 'otherwise', reason: 'AI evaluation failed' };
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const routes = config.routes as unknown[] | undefined;
    if (!routes || routes.length === 0) {
      return { valid: false, errors: ['At least one route is required'] };
    }
    return { valid: true };
  }
}
