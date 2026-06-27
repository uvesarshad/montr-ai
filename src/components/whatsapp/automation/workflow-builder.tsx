'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    Connection,
    Edge,
    Node,
    ReactFlowProvider,
    Panel,
    type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Play, Loader2, MoreVertical } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomNode } from './custom-node';
import { NodePalette } from './node-palette';
import { NodeConfigPanel } from './node-config-panel';
import { NodeDefinition } from '@/lib/whatsapp/automation/node-definitions';

const nodeTypes = {
    custom: CustomNode,
};

interface InitialWorkflow {
    name?: string;
    nodes?: Node[];
    edges?: Edge[];
}

interface WorkflowBuilderProps {
    workflowId: string;
    initialWorkflow?: InitialWorkflow;
}

function WorkflowBuilderInner({ workflowId, initialWorkflow }: WorkflowBuilderProps) {
    const { push } = useRouter();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflow?.edges || []);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [saving, setSaving] = useState(false);
    const [workflowName, setWorkflowName] = useState(initialWorkflow?.name || 'Untitled Workflow');
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [configPanelOpen, setConfigPanelOpen] = useState(false);
    const { toast } = useToast();

    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            if (!reactFlowWrapper.current || !reactFlowInstance) return;

            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const nodeDefinition: NodeDefinition = JSON.parse(
                event.dataTransfer.getData('application/reactflow')
            );

            const position = reactFlowInstance.project({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });

            const newNode: Node = {
                id: `${nodeDefinition.type}-${nodeDefinition.subType}-${Date.now()}`,
                type: 'custom',
                position,
                data: {
                    label: nodeDefinition.label,
                    nodeType: nodeDefinition.type,
                    subType: nodeDefinition.subType,
                    config: nodeDefinition.defaultData || {},
                    preview: '',
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, setNodes]
    );

    const onNodeDragStart = useCallback((event: React.DragEvent, nodeDefinition: NodeDefinition) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeDefinition));
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setConfigPanelOpen(true);
    }, []);

    const handleNodeConfigSave = useCallback((nodeId: string, data: Node['data']) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data };
                }
                return node;
            })
        );
    }, [setNodes]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/whatsapp/workflows/${workflowId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: workflowName,
                    nodes: nodes.map((node) => ({
                        id: node.id,
                        type: node.data.nodeType,
                        subType: node.data.subType,
                        position: node.position,
                        data: node.data,
                    })),
                    edges: edges.map((edge) => ({
                        id: edge.id,
                        source: edge.source,
                        target: edge.target,
                        sourceHandle: edge.sourceHandle,
                        targetHandle: edge.targetHandle,
                    })),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save workflow');
            }

            toast({
                title: 'Success',
                description: 'Workflow saved successfully',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save workflow',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleActivate = async () => {
        try {
            // Save first
            await handleSave();

            // Then activate
            const response = await fetch(`/api/whatsapp/workflows/${workflowId}/activate`, {
                method: 'POST',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to activate workflow');
            }

            toast({
                title: 'Success',
                description: 'Workflow activated successfully',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to activate workflow',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="flex h-full">
            <NodePalette onNodeDragStart={onNodeDragStart} />

            <div className="flex-1 relative" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    className="bg-slate-50 dark:bg-zinc-900"
                >
                    <Background />
                    <Controls />
                    <MiniMap
                        nodeColor={(node) => {
                            const nodeType = node.data.nodeType;
                            const colors: Record<string, string> = {
                                trigger: '#10b981',
                                message: '#3b82f6',
                                logic: '#f59e0b',
                                ai: '#8b5cf6',
                                data: '#06b6d4',
                                api: '#ec4899',
                            };
                            return colors[nodeType] || '#6b7280';
                        }}
                        className="!bg-background !border"
                    />

                    <Panel position="top-left" className="!m-4">
                        <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-4 shadow-lg">
                            <input
                                type="text"
                                value={workflowName}
                                onChange={(e) => setWorkflowName(e.target.value)}
                                className="text-xl font-bold bg-transparent border-none outline-none focus:ring-0 w-full"
                                placeholder="Workflow Name"
                            />
                        </div>
                    </Panel>

                    <Panel position="top-right" className="!m-4 flex gap-x-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <MoreVertical className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => {
                                    const dataStr = JSON.stringify({
                                        name: workflowName,
                                        nodes,
                                        edges,
                                        trigger: { type: 'message', config: {} }, // Should ideally come from state/props
                                    }, null, 2);
                                    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                                    const exportFileDefaultName = `${workflowName.replace(/\s+/g, '_').toLowerCase()}.json`;
                                    const linkElement = document.createElement('a');
                                    linkElement.setAttribute('href', dataUri);
                                    linkElement.setAttribute('download', exportFileDefaultName);
                                    linkElement.click();
                                }}>
                                    Export JSON
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" size="sm" onClick={() => push(`/marketing/whatsapp/automation/${workflowId}/test`)}>
                            Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => push(`/marketing/whatsapp/automation/${workflowId}/executions`)}>
                            Executions
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <Loader2 className="size-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="size-4 mr-2" />
                            )}
                            Save
                        </Button>
                        <Button size="sm" onClick={handleActivate}>
                            <Play className="size-4 mr-2" />
                            Activate
                        </Button>
                    </Panel>
                </ReactFlow>

                <NodeConfigPanel
                    node={selectedNode}
                    isOpen={configPanelOpen}
                    onClose={() => setConfigPanelOpen(false)}
                    onSave={handleNodeConfigSave}
                />
            </div>
        </div>
    );
}

export function WorkflowBuilder(props: WorkflowBuilderProps) {
    return (
        <ReactFlowProvider>
            <WorkflowBuilderInner {...props} />
        </ReactFlowProvider>
    );
}

