import { Types } from 'mongoose';
import { whatsappWorkflowRepository } from '../db/repository/whatsapp-workflow.repository';
import { IWhatsAppWorkflow, IWorkflowNode, IWorkflowEdge } from '../db/models/whatsapp-workflow.model';

export class WhatsAppWorkflowService {
    /**
     * Validate workflow structure
     */
    validateWorkflow(nodes: IWorkflowNode[], edges: IWorkflowEdge[]): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Check if there's at least one trigger node
        const triggerNodes = nodes.filter(n => n.type === 'trigger');
        if (triggerNodes.length === 0) {
            errors.push('Workflow must have at least one trigger node');
        }
        if (triggerNodes.length > 1) {
            errors.push('Workflow can only have one trigger node');
        }

        // Check for orphaned nodes (nodes with no connections)
        const connectedNodeIds = new Set<string>();
        edges.forEach(edge => {
            connectedNodeIds.add(edge.source);
            connectedNodeIds.add(edge.target);
        });

        const orphanedNodes = nodes.filter(n =>
            n.type !== 'trigger' && !connectedNodeIds.has(n.id)
        );
        if (orphanedNodes.length > 0) {
            errors.push(`Found ${orphanedNodes.length} orphaned node(s)`);
        }

        // Check for cycles (simple detection)
        const hasCycle = this.detectCycle(nodes, edges);
        if (hasCycle) {
            errors.push('Workflow contains a cycle (infinite loop)');
        }

        // Check if all edge references exist
        edges.forEach(edge => {
            const sourceExists = nodes.some(n => n.id === edge.source);
            const targetExists = nodes.some(n => n.id === edge.target);

            if (!sourceExists) {
                errors.push(`Edge references non-existent source node: ${edge.source}`);
            }
            if (!targetExists) {
                errors.push(`Edge references non-existent target node: ${edge.target}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Detect cycles in workflow graph
     */
    private detectCycle(nodes: IWorkflowNode[], edges: IWorkflowEdge[]): boolean {
        const adjList = new Map<string, string[]>();

        // Build adjacency list
        nodes.forEach(node => adjList.set(node.id, []));
        edges.forEach(edge => {
            const neighbors = adjList.get(edge.source) || [];
            neighbors.push(edge.target);
            adjList.set(edge.source, neighbors);
        });

        const visited = new Set<string>();
        const recStack = new Set<string>();

        const dfs = (nodeId: string): boolean => {
            visited.add(nodeId);
            recStack.add(nodeId);

            const neighbors = adjList.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (dfs(neighbor)) return true;
                } else if (recStack.has(neighbor)) {
                    return true; // Cycle detected
                }
            }

            recStack.delete(nodeId);
            return false;
        };

        for (const node of nodes) {
            if (!visited.has(node.id)) {
                if (dfs(node.id)) return true;
            }
        }

        return false;
    }

    /**
     * Create a new workflow
     */
    async createWorkflow(
        userId: string,
        workflowData: Partial<IWhatsAppWorkflow>
    ): Promise<IWhatsAppWorkflow> {
        // Validate workflow if nodes and edges are provided
        if (workflowData.nodes && workflowData.edges) {
            const validation = this.validateWorkflow(workflowData.nodes, workflowData.edges);
            if (!validation.valid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }
        }

        return await whatsappWorkflowRepository.create({
            ...workflowData,
            userId: new Types.ObjectId(userId)
        });
    }

    /**
     * Update workflow
     */
    async updateWorkflow(
        id: string,
        userId: string,
        updates: Partial<IWhatsAppWorkflow>
    ): Promise<IWhatsAppWorkflow> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        // Validate if updating nodes/edges
        if (updates.nodes || updates.edges) {
            const nodes = updates.nodes || workflow.nodes;
            const edges = updates.edges || workflow.edges;

            const validation = this.validateWorkflow(nodes, edges);
            if (!validation.valid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }
        }

        const updated = await whatsappWorkflowRepository.update(id, updates);
        if (!updated) {
            throw new Error('Failed to update workflow');
        }

        return updated;
    }

    /**
     * Get workflow by ID
     */
    async getWorkflow(id: string, userId: string): Promise<IWhatsAppWorkflow> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        return workflow;
    }

    /**
     * List workflows
     */
    async listWorkflows(
        userId: string,
        options?: {
            status?: string;
            limit?: number;
            skip?: number;
        }
    ): Promise<{
        workflows: IWhatsAppWorkflow[];
        total: number;
    }> {
        const workflows = await whatsappWorkflowRepository.findByUserId(userId, options);
        const total = await whatsappWorkflowRepository.countByUserId(userId, options?.status);

        return { workflows, total };
    }

    /**
     * Delete workflow
     */
    async deleteWorkflow(id: string, userId: string): Promise<void> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        await whatsappWorkflowRepository.delete(id);
    }

    /**
     * Activate workflow
     */
    async activateWorkflow(id: string, userId: string): Promise<IWhatsAppWorkflow> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        // Validate before activation
        const validation = this.validateWorkflow(workflow.nodes, workflow.edges);
        if (!validation.valid) {
            throw new Error(`Cannot activate invalid workflow: ${validation.errors.join(', ')}`);
        }

        const activated = await whatsappWorkflowRepository.activate(id);
        if (!activated) {
            throw new Error('Failed to activate workflow');
        }

        return activated;
    }

    /**
     * Deactivate workflow
     */
    async deactivateWorkflow(id: string, userId: string): Promise<IWhatsAppWorkflow> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        const deactivated = await whatsappWorkflowRepository.deactivate(id);
        if (!deactivated) {
            throw new Error('Failed to deactivate workflow');
        }

        return deactivated;
    }

    /**
     * Clone workflow
     */
    async cloneWorkflow(
        id: string,
        userId: string,
        newName?: string
    ): Promise<IWhatsAppWorkflow> {
        const workflow = await whatsappWorkflowRepository.findById(id);

        if (!workflow) {
            throw new Error('Workflow not found');
        }

        if (workflow.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        return await whatsappWorkflowRepository.clone(id, userId, newName);
    }

    /**
     * Search workflows
     */
    async searchWorkflows(
        userId: string,
        searchTerm: string,
        options?: {
            status?: string;
            limit?: number;
            skip?: number;
        }
    ): Promise<IWhatsAppWorkflow[]> {
        return await whatsappWorkflowRepository.search(userId, searchTerm, options);
    }
}

export const whatsappWorkflowService = new WhatsAppWorkflowService();
