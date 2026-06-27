'use client';

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { Position, NodeProps, getIncomers, useStoreApi } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import NodeShell from './node-shell';
import { Type } from 'lucide-react';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { cn } from '@/lib/utils';
import NodeHandle from './node-handle';

// Function to strip Markdown syntax
const stripMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/^#+\s/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/^>\s/gm, '')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/^-{3,}\s*$/gm, '')
    .trim();
};

// Helper function to extract content from a node based on its type
const getNodeContent = (node: { type?: string; data?: Record<string, string | undefined> }): string => {
  const t = node.type;
  const d = node.data || {};

  if (t === 'promptNode') return d.text || '';
  if (t === 'websiteNode') return d.markdownContent || '';
  if (t === 'pinterestNode') return d.aiPrompt || d.description || '';
  if (t === 'youtubeNode') return d.transcript || '';
  if (t === 'instagramNode') return d.text || d.transcript || '';
  if (t === 'xNode') return d.text || '';
  if (t === 'redditNode') return d.content || '';
  if (t === 'audioNode') return d.transcript || '';
  if (t === 'fileNode') return d.text || d.content || '';
  if (t === 'imageNode') return d.text || '';
  if (t === 'linkedinNode') return d.url || ''; // LinkedIn just has URL

  // Fallback
  return d.aiPrompt || d.text || d.transcript || d.markdownContent || d.content || '';
};

// Footer stats component for word/char count + variable detection
const TextStats = React.memo(({ text }: { text: string }) => {
  const stats = useMemo(() => {
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const variables = text.match(/\{\{[^}]+\}\}/g) || [];
    return { charCount, wordCount, variables };
  }, [text]);

  return (
    <div className="flex items-center justify-between px-1 py-1 text-[10px] text-muted-foreground border-t border-border/30 mt-1">
      <span>{stats.wordCount} words · {stats.charCount} chars</span>
      {stats.variables.length > 0 && (
        <span className="text-primary/70">
          {stats.variables.length} {'{{var}}'}
        </span>
      )}
    </div>
  );
});
TextStats.displayName = 'TextStats';

const TextInputNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const store = useStoreApi();
  const { updateNodeData, deleteNode } = useNodeUtils(id);

  const isUserEditingRef = useRef(false);
  const lastContentHashRef = useRef<string>('');

  const onChange = useCallback(
    (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
      isUserEditingRef.current = true;
      updateNodeData({ text: evt.target.value });
      setTimeout(() => {
        isUserEditingRef.current = false;
      }, 200);
    },
    [updateNodeData]
  );

  // Function to pull data from incoming nodes using store directly
  const pullIncomingData = useCallback(() => {
    if (isUserEditingRef.current) return;

    // Get fresh state directly from store
    const state = store.getState();
    const nodes = Array.from(state.nodeInternals.values());
    const edges = state.edges;

    const currentNode = nodes.find((n) => n.id === id);
    if (!currentNode) return;

    const incomers = getIncomers(currentNode, nodes, edges);
    if (incomers.length === 0) return;

    // Collect content from all incoming nodes
    const contents: string[] = [];
    for (const incomer of incomers) {
      const content = getNodeContent(incomer);
      if (content) {
        contents.push(content);
      }
    }

    if (contents.length === 0) return;

    const incomingText = contents.join('\n\n');
    const strippedText = stripMarkdown(incomingText);

    // Create hash to detect changes
    const contentHash = `${incomers.map(n => n.id).join(',')}:${strippedText.slice(0, 100)}`;

    // Only update if content actually changed
    if (contentHash !== lastContentHashRef.current && strippedText) {
      lastContentHashRef.current = contentHash;

      // Get current text from store to compare
      const currentText = currentNode.data?.text || '';
      if (strippedText !== currentText) {
        console.log('[TextInputNode] Pulling content from:', incomers.map(n => `${n.type}(${n.id.slice(-4)})`));
        updateNodeData({ text: strippedText });
      }
    }
  }, [id, store, updateNodeData]);

  // Poll for incoming data - runs on mount and every 300ms
  useEffect(() => {
    // Initial pull
    const initialTimeout = setTimeout(pullIncomingData, 100);

    // Polling interval
    const interval = setInterval(pullIncomingData, 300);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [pullIncomingData]);

  return (
    <NodeShell
      id={id}
      nodeType="textInput"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      className={cn(
        `transition-all duration-200`,
        selected ? '' : 'hover:ring-1 hover:ring-border/50'
      )}
      contentClassName="p-4 relative"
      title="Text"
      icon={<Type className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="textInput" isConnectable={isConnectable} />
      <Textarea
        id={`text-${id}`}
        name="text"
        value={data.text || ''}
        onChange={onChange}
        className="nodrag mt-1 bg-transparent flex-grow w-full h-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Type or paste text here... Use {{variable}} for dynamic content"
      />
      <TextStats text={data.text || ''} />
      <NodeHandle type="source" position={Position.Right} nodeType="textInput" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default TextInputNode;
