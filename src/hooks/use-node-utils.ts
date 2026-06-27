'use client';

import { useCallback } from 'react';
import { useReactFlow, useStoreApi, getOutgoers, getIncomers, Edge } from 'reactflow';

/**
 * Target node types that can receive propagated content
 */
const DEFAULT_PROPAGATION_TARGETS = ['textInput', 'promptNode', 'documentNode', 'publishNode'];

interface PropagationOptions {
    /** Which node types should receive the content */
    targetTypes?: string[];
    /** Whether to append to existing content or replace it */
    mode?: 'append' | 'replace';
    /** Which data key to update on target nodes */
    contentKey?: 'text' | 'content' | 'transcript' | 'markdownContent';
}

/**
 * Centralized utility hook for common node operations.
 * Eliminates duplicate code across node components.
 * 
 * @param nodeId - The ID of the current node
 * @param reactiveEdges - Optional: Pass useEdges() result for reactivity when nodes connect after data is fetched
 */
export function useNodeUtils(nodeId: string, reactiveEdges?: Edge[]) {
    const { setNodes, getNodes, getEdges } = useReactFlow();
    const store = useStoreApi();

    // Use reactive edges if provided, otherwise fall back to getEdges()
    const getCurrentEdges = useCallback(() => {
        return reactiveEdges || getEdges();
    }, [reactiveEdges, getEdges]);

    /**
     * Updates the data object of the current node
     */
    const updateNodeData = useCallback(
        (newData: Record<string, unknown>) => {
            setNodes((nds) =>
                nds.map((node) =>
                    node.id === nodeId
                        ? { ...node, data: { ...node.data, ...newData } }
                        : node
                )
            );
        },
        [nodeId, setNodes]
    );

    /**
     * Deletes the current node from the canvas
     */
    const deleteNode = useCallback(() => {
        setNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
    }, [nodeId, setNodes]);

    /**
     * Propagates content to all connected outgoing nodes
     */
    const propagateToOutgoers = useCallback(
        (content: string, options: PropagationOptions = {}) => {
            const {
                targetTypes = DEFAULT_PROPAGATION_TARGETS,
                mode = 'replace',
                contentKey = 'text',
            } = options;

            if (!content) return;

            const { nodeInternals } = store.getState();
            const currentNode = nodeInternals.get(nodeId);
            if (!currentNode) return;

            const outgoers = getOutgoers(currentNode, getNodes(), getCurrentEdges());

            setNodes((nds) =>
                nds.map((node) => {
                    if (
                        outgoers.some((o) => o.id === node.id) &&
                        targetTypes.includes(node.type || '')
                    ) {
                        const existingContent = node.data[contentKey] || '';
                        const newContent =
                            mode === 'append' && existingContent
                                ? `${existingContent}\n\n${content}`
                                : content;

                        // Handle different content keys based on node type
                        const updateKey =
                            node.type === 'publishNode' || node.type === 'documentNode'
                                ? 'content'
                                : contentKey;

                        return { ...node, data: { ...node.data, [updateKey]: newContent } };
                    }
                    return node;
                })
            );
        },
        [nodeId, store, getNodes, getCurrentEdges, setNodes]
    );

    /**
     * Gets the combined content from all incoming connected nodes
     */
    const getIncomingContent = useCallback((): string => {
        const allNodes = getNodes();
        const allEdges = getCurrentEdges();
        const currentNode = allNodes.find((n) => n.id === nodeId);
        if (!currentNode) return '';

        const incomers = getIncomers(currentNode, allNodes, allEdges);
        return incomers
            .map((node) => {
                // For prompt nodes, prefer the AI-generated 'text' over 'prompt'
                if (node.type === 'promptNode') {
                    return node.data.text || '';
                }
                // For Pinterest, prefer aiPrompt
                if (node.data.aiPrompt) {
                    return node.data.aiPrompt;
                }
                // For other nodes, check various content fields
                return (
                    node.data.text ||
                    node.data.transcript ||
                    node.data.markdownContent ||
                    node.data.content ||
                    ''
                );
            })
            .filter(Boolean)
            .join('\n\n');
    }, [nodeId, getNodes, getCurrentEdges]);

    /**
     * Gets incoming content including media URLs
     */
    const getIncomingContext = useCallback((): {
        text: string;
        imageUrl: string | null;
        videoUrl: string | null;
    } => {
        const allNodes = getNodes();
        const allEdges = getCurrentEdges();
        const currentNode = allNodes.find((n) => n.id === nodeId);
        if (!currentNode) return { text: '', imageUrl: null, videoUrl: null };

        const incomers = getIncomers(currentNode, allNodes, allEdges);

        let text = '';
        let imageUrl: string | null = null;
        let videoUrl: string | null = null;

        incomers.forEach((node) => {
            // Collect text content - prioritize aiPrompt for design nodes
            const nodeText =
                node.data.aiPrompt ||
                (node.type === 'promptNode'
                    ? node.data.text || ''
                    : node.data.text ||
                    node.data.transcript ||
                    node.data.markdownContent ||
                    node.data.content ||
                    '');

            if (nodeText) {
                text += (text ? '\n\n' : '') + nodeText;
            }

            // Collect media URLs
            if (node.data.imageUrl && !imageUrl) {
                imageUrl = node.data.imageUrl;
            }
            if (node.data.videoUrl && !videoUrl) {
                videoUrl = node.data.videoUrl;
            }
        });

        return { text, imageUrl, videoUrl };
    }, [nodeId, getNodes, getCurrentEdges]);

    /**
     * Gets incoming images with handle-aware routing for multi-output nodes.
     * Returns images from connected nodes, respecting which specific output handle
     * is connected (e.g., image-output-0, image-output-1, etc.)
     */
    const getIncomingImages = useCallback((): {
        images: string[];
        sourceHandles: { nodeId: string; handleId: string; imageUrl: string }[];
    } => {
        const allNodes = getNodes();
        const allEdges = getCurrentEdges();
        const images: string[] = [];
        const sourceHandles: { nodeId: string; handleId: string; imageUrl: string }[] = [];

        // Find edges that connect TO this node
        const incomingEdges = allEdges.filter((edge) => edge.target === nodeId);

        incomingEdges.forEach((edge) => {
            const sourceNode = allNodes.find((n) => n.id === edge.source);
            if (!sourceNode) return;

            const sourceHandleId = edge.sourceHandle || 'image-output';

            // Check if it's a generate-image node with multiple outputs
            if (sourceNode.type === 'generateImage' && sourceNode.data.generatedImages) {
                const generatedImages = sourceNode.data.generatedImages as string[];

                // Parse the handle index from the handle ID (e.g., "image-output-2" -> 2)
                const handleMatch = sourceHandleId.match(/image-output-(\d+)/);
                if (handleMatch) {
                    const imageIndex = parseInt(handleMatch[1], 10);
                    if (generatedImages[imageIndex]) {
                        images.push(generatedImages[imageIndex]);
                        sourceHandles.push({
                            nodeId: sourceNode.id,
                            handleId: sourceHandleId,
                            imageUrl: generatedImages[imageIndex],
                        });
                    }
                } else if (generatedImages.length > 0) {
                    // Fallback: if no index in handle, use first image
                    images.push(generatedImages[0]);
                    sourceHandles.push({
                        nodeId: sourceNode.id,
                        handleId: sourceHandleId,
                        imageUrl: generatedImages[0],
                    });
                }
            }
            // Handle regular image nodes with single imageUrl
            else if (sourceNode.data.imageUrl) {
                images.push(sourceNode.data.imageUrl);
                sourceHandles.push({
                    nodeId: sourceNode.id,
                    handleId: sourceHandleId,
                    imageUrl: sourceNode.data.imageUrl,
                });
            }
            // Handle file nodes with image files
            else if (sourceNode.data.files && Array.isArray(sourceNode.data.files)) {
                sourceNode.data.files.forEach((file: { type?: string; previewUrl?: string }) => {
                    if (file.type === 'image' && file.previewUrl) {
                        images.push(file.previewUrl);
                        sourceHandles.push({
                            nodeId: sourceNode.id,
                            handleId: sourceHandleId,
                            imageUrl: file.previewUrl,
                        });
                    }
                });
            }
        });

        return { images, sourceHandles };
    }, [nodeId, getNodes, getCurrentEdges]);

    return {
        updateNodeData,
        deleteNode,
        propagateToOutgoers,
        getIncomingContent,
        getIncomingContext,
        getIncomingImages,
    };
}
