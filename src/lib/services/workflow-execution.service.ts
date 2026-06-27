import mongoose from 'mongoose';
import { workflowExecutionRepository } from '../db/repository/workflow-execution.repository';
import { whatsappWorkflowRepository } from '../db/repository/whatsapp-workflow.repository';
import { IWorkflowExecution } from '../db/models/workflow-execution.model';
import { IWhatsAppWorkflow, IWorkflowNode } from '../db/models/whatsapp-workflow.model';
import { nodeProcessors } from './workflow-node-processors.service';

interface ExecutionContext {
    workflowId: string;
    contactId: string;
    userId: string;
    triggerData: Record<string, unknown>;
    variables: Record<string, unknown>;
}

export class WorkflowExecutionService {
    /**
     * Start workflow execution
     */
    async executeWorkflow(context: ExecutionContext): Promise<IWorkflowExecution> {
        const workflow = await whatsappWorkflowRepository.findById(context.workflowId);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.status !== 'active') {
            throw new Error('Workflow is not active');
        }

        // Create execution record
        const execution = await workflowExecutionRepository.create({
            workflowId: workflow._id,
            contactId: context.contactId as unknown as mongoose.Types.ObjectId,
            userId: context.userId as unknown as mongoose.Types.ObjectId,
            status: 'running',
            variables: context.variables || {},
            triggerData: context.triggerData,
            executionPath: [],
        });

        try {
            // Find trigger node
            const triggerNode = workflow.nodes.find((n) => n.type === 'trigger');
            if (!triggerNode) {
                throw new Error('No trigger node found');
            }

            // Start execution from trigger
            await this.executeNode(workflow, triggerNode, execution);

            // Mark as completed
            await workflowExecutionRepository.updateStatus(execution._id.toString(), 'completed');

            // Increment workflow execution count
            await whatsappWorkflowRepository.incrementExecutionCount(workflow._id.toString());

            return execution;
        } catch (error: unknown) {
            // Mark as failed
            await workflowExecutionRepository.updateStatus(
                execution._id.toString(),
                'failed',
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }
    }

    /**
     * Execute a single node
     */
    private async executeNode(
        workflow: IWhatsAppWorkflow,
        node: IWorkflowNode,
        execution: IWorkflowExecution
    ): Promise<void> {
        const startTime = Date.now();

        try {
            // Update current node
            await workflowExecutionRepository.updateCurrentNode(
                execution._id.toString(),
                node.id
            );

            // Execute node based on type
            let output: Record<string, unknown>;
            switch (node.subType) {
                case 'send-text':
                    output = await nodeProcessors.executeSendText(node, execution);
                    break;
                case 'send-image':
                    output = await nodeProcessors.executeSendImage(node, execution);
                    break;
                case 'send-pdf':
                    output = await nodeProcessors.executeSendPDF(node, execution);
                    break;
                case 'send-video':
                    output = await nodeProcessors.executeSendVideo(node, execution);
                    break;
                case 'send-template':
                    output = await nodeProcessors.executeSendTemplate(node, execution);
                    break;
                case 'branch':
                    output = await this.executeBranch(node, execution);
                    break;
                case 'counter':
                    output = await this.executeCounter(node, execution);
                    break;
                case 'delay':
                    output = await this.executeDelay(node, execution);
                    break;
                case 'variables':
                    output = await this.executeSetVariable(node, execution);
                    break;
                case 'agentic':
                    output = await nodeProcessors.executeAIAgent(node, execution);
                    break;
                case 'knowledge-base':
                    output = await nodeProcessors.executeKnowledgeBase(node, execution);
                    break;
                case 'bot-config':
                    output = await nodeProcessors.executeBotConfig(node, execution);
                    break;
                case 'assign-group':
                    output = await nodeProcessors.executeAssignGroup(node, execution);
                    break;
                case 'end':
                    output = { terminated: true };
                    break;
                default:
                    output = { skipped: true };
            }

            // Log successful step
            await workflowExecutionRepository.addStep(execution._id.toString(), {
                nodeId: node.id,
                nodeName: node.data.label || node.subType,
                status: 'success',
                output,
                duration: Date.now() - startTime,
            });

            // If end node or terminated, stop execution
            if (node.subType === 'end' || output?.terminated) {
                return;
            }

            // Find next node(s)
            const nextNodes = this.getNextNodes(workflow, node, output);

            // Execute next nodes
            for (const nextNode of nextNodes) {
                await this.executeNode(workflow, nextNode, execution);
            }
        } catch (error: unknown) {
            // Log failed step
            await workflowExecutionRepository.addStep(execution._id.toString(), {
                nodeId: node.id,
                nodeName: node.data.label || node.subType,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            });
            throw error;
        }
    }

    /**
     * Get next nodes to execute
     */
    private getNextNodes(
        workflow: IWhatsAppWorkflow,
        currentNode: IWorkflowNode,
        output: Record<string, unknown>
    ): IWorkflowNode[] {
        const nextNodes: IWorkflowNode[] = [];

        // Find edges from current node
        const edges = workflow.edges.filter((e) => e.source === currentNode.id);

        for (const edge of edges) {
            // For branch nodes, check the output handle
            if (currentNode.subType === 'branch') {
                const branchResult = output?.result === true ? 'true' : 'false';
                if (edge.sourceHandle !== branchResult) {
                    continue;
                }
            }

            // Find target node
            const targetNode = workflow.nodes.find((n) => n.id === edge.target);
            if (targetNode) {
                nextNodes.push(targetNode);
            }
        }

        return nextNodes;
    }

    /**
     * Execute send text node
     */

    /**
     * Execute send image node
     */

    /**
     * Execute branch node
     */
    private async executeBranch(
        node: IWorkflowNode,
        execution: IWorkflowExecution
    ): Promise<Record<string, unknown>> {
        const config = node.data.config ?? {};
        const variableKey = (config.variable as string) || '';
        const variable = execution.variables[variableKey];
        const operator = config.operator as string | undefined;
        const value = config.value;

        let result = false;

        switch (operator) {
            case 'equals':
                result = variable == value;
                break;
            case 'not_equals':
                result = variable != value;
                break;
            case 'contains':
                result = String(variable).includes(String(value));
                break;
            case 'greater_than':
                result = Number(variable) > Number(value);
                break;
            case 'less_than':
                result = Number(variable) < Number(value);
                break;
        }

        return { result, variable, operator, value };
    }

    /**
     * Execute counter node
     */
    private async executeCounter(
        node: IWorkflowNode,
        execution: IWorkflowExecution
    ): Promise<Record<string, unknown>> {
        const config = node.data.config ?? {};
        const variableName = (config.variable as string) || 'counter';
        const operation = (config.operation as string) || 'increment';
        const stepValue = (config.value as number) || 1;

        let currentValue = (execution.variables[variableName] as number) || 0;

        switch (operation) {
            case 'increment':
                currentValue += stepValue;
                break;
            case 'decrement':
                currentValue -= stepValue;
                break;
            case 'set':
                currentValue = stepValue;
                break;
        }

        // Update variable
        await workflowExecutionRepository.updateVariables(execution._id.toString(), {
            ...execution.variables,
            [variableName]: currentValue,
        });

        execution.variables[variableName] = currentValue;

        return { variable: variableName, value: currentValue };
    }

    /**
     * Execute delay node
     */
    private async executeDelay(
        node: IWorkflowNode,
        _execution: IWorkflowExecution
    ): Promise<Record<string, unknown>> {
        const config = node.data.config ?? {};
        const duration = (config.duration as number) || 60;
        const unit = (config.unit as string) || 'seconds';

        let milliseconds = duration * 1000;
        if (unit === 'minutes') milliseconds *= 60;
        if (unit === 'hours') milliseconds *= 3600;

        await new Promise((resolve) => setTimeout(resolve, milliseconds));

        return { delayed: true, duration, unit };
    }

    /**
     * Execute set variable node
     */
    private async executeSetVariable(
        node: IWorkflowNode,
        execution: IWorkflowExecution
    ): Promise<Record<string, unknown>> {
        const config = node.data.config ?? {};
        const variableName = (config.variableName as string) || '';
        let value = (config.value as string) || '';

        // Replace variables in value
        value = this.replaceVariables(value, execution.variables);

        // Update variable
        await workflowExecutionRepository.updateVariables(execution._id.toString(), {
            ...execution.variables,
            [variableName]: value,
        });

        execution.variables[variableName] = value;

        return { variable: variableName, value };
    }

    /**
     * Replace variables in text
     */
    private replaceVariables(text: string, variables: Record<string, unknown>): string {
        let result = text;

        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{${key}\\}`, 'g');
            result = result.replace(regex, String(value));
        }

        return result;
    }

    /**
     * Check if message matches workflow trigger
     */
    async checkTrigger(
        workflow: IWhatsAppWorkflow,
        message: string
    ): Promise<boolean> {
        const trigger = workflow.trigger;

        switch (trigger.type) {
            case 'message':
                return true; // Any message triggers

            case 'keywords':
                const keywords = trigger.config.keywords || [];
                const matchType = trigger.config.matchType || 'contains';
                const caseSensitive = trigger.config.caseSensitive || false;

                const messageText = caseSensitive ? message : message.toLowerCase();

                for (const keyword of keywords) {
                    const keywordText = caseSensitive ? keyword : keyword.toLowerCase();

                    if (matchType === 'exact' && messageText === keywordText) {
                        return true;
                    }
                    if (matchType === 'contains' && messageText.includes(keywordText)) {
                        return true;
                    }
                    if (matchType === 'regex') {
                        const regex = new RegExp(keywordText, caseSensitive ? '' : 'i');
                        if (regex.test(messageText)) {
                            return true;
                        }
                    }
                }
                return false;

            default:
                return false;
        }
    }
}

export const workflowExecutionService = new WorkflowExecutionService();
