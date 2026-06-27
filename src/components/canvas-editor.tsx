
'use client';

import React, { useState, useRef, useCallback, DragEvent, useEffect, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Node,
  Edge,
  Connection,
  EdgeTypes,
  NodeTypes,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
  OnConnectEnd,
} from 'reactflow';

import { CanvasToolbar } from './canvas/canvas-toolbar';
import NodeConfigSidebar from './canvas/node-config-sidebar';
import TestStepResultDialog, { type TestStepResult } from './canvas/test-step-result-dialog';
import CanvasExecutionControl from './canvas/execution-control';
import StickyNoteNode from './nodes/sticky-note-node';
import { toPng } from 'html-to-image';
import { useSession } from '@/lib/auth-client';
import { useTheme } from 'next-themes';
import { Loader2, Maximize2 } from 'lucide-react';
import { uploadCanvasPreview } from '@/lib/upload-preview';

import { Skeleton } from './ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import TextInputNode from './nodes/text-input-node';
import FileNode from './nodes/file-node';
import ImageNode from './nodes/image-node';
import WebsiteNode from './nodes/website-node';
import YouTubeNode from './nodes/youtube-node';
import InstagramNode from './nodes/instagram-node';
import AudioNode from './nodes/audio-node';
import CustomEdge from './edges/custom-edge';
import LinkedinNode from './nodes/linkedin-node';
import XNode from './nodes/x-node';
import RedditNode from './nodes/reddit-node';
import PinterestNode from './nodes/pinterest-node';
import FacebookNode from './nodes/facebook-node';
import GoogleBusinessNode from './nodes/google-business-node';
import GoogleSearchNode from './nodes/google-search-node';
import AdsInsightsNode from './nodes/ads-insights-node';
import NotionNode from './nodes/notion-node';
import GoogleWorkspaceNode from './nodes/google-workspace-node';
import IntegrationHubNode from './nodes/integration-hub-node';
import CrmActionNode, { CRM_ACTION_NODE_TYPES } from './nodes/crm-action-node';
import VoiceActionNode, { VOICE_ACTION_NODE_TYPES } from './nodes/voice-action-node';
import DataTransformNode, { DATA_TRANSFORM_NODE_TYPES } from './nodes/data-transform-node';
import AIChatbotNode from './nodes/ai-chatbot-node';
import GenerateImageNode from './nodes/generate-image-node';
import GenerateVideoNode from './nodes/generate-video-node';
import PromptNode from './nodes/prompt-node';
import DocumentNode from './nodes/document-node';
import PublishNode from './nodes/publish-node';
import { NODE_DIMENSIONS } from './nodes/node-shell';
import { categoryFor, CATEGORY_THEME } from './nodes/node-categories';
import { ExecutionProvider } from '@/contexts/execution-context';
import { QuickNodeSearch } from './canvas/quick-node-search';
import { RadialMenu, RadialMenuVariant } from './canvas/radial-menu';
import { EmptyCanvasOnboarding } from './canvas/empty-canvas-onboarding';

// Trigger nodes
import WebhookTriggerNode from './nodes/triggers/webhook-trigger-node';
import ScheduleTriggerNode from './nodes/triggers/schedule-trigger-node';
import ManualTriggerNode from './nodes/triggers/manual-trigger-node';
import WhatsAppTriggerNode from './nodes/triggers/whatsapp-trigger-node';
import EmailTriggerNode from './nodes/triggers/email-trigger-node';
import SocialTriggerNode from './nodes/triggers/social-trigger-node';
import KeywordTriggerNode from './nodes/triggers/keyword-trigger-node';
import TelegramTriggerNode from './nodes/triggers/telegram-trigger-node';
import IntegrationWebhookTriggerNode from './nodes/triggers/integration-webhook-trigger-node';
import AdLeadTriggerNode from './nodes/triggers/ad-lead-trigger-node';

// Logic nodes
import BranchNode from './nodes/logic/branch-node';
import DelayNode from './nodes/logic/delay-node';
import LoopNode from './nodes/logic/loop-node';

// Action nodes
import WhatsAppActionNode from './nodes/actions/whatsapp-action-node';
import MarketingEmailNode from './nodes/actions/marketing-email-node';
import ConversationalEmailNode from './nodes/actions/conversational-email-node';
import TelegramNode from './nodes/telegram-node';

// New Phase 1 nodes
import AgenticNode from './nodes/agentic-node';
import InstagramDMNode from './nodes/instagram-dm-node';
import ChatbotNode from './nodes/chatbot-node';
import SmartRouterNode from './nodes/smart-router-node';
import HttpRequestNode from './nodes/http-request-node';
import AudioBotNode from './nodes/audio-bot-node';
// Phase 3 nodes
import GroupNode from './nodes/group-node';
import SubWorkflowNode from './nodes/sub-workflow-node';
// Agent ↔ workflow ties (2.26)
import DelegateToAgentNode from './nodes/delegate-to-agent-node';
// generateWorkflow Genkit flow is deprecated — AI workflow dialog now calls /api/v2/ai-workflow/generate directly

const getId = () => `dndnode_${Date.now()}_${Math.random()}`;

const nodeTypes: NodeTypes = {
  // Data source nodes
  textInput: TextInputNode,
  fileNode: FileNode,
  imageNode: ImageNode,
  pinterestNode: PinterestNode,
  websiteNode: WebsiteNode,
  youtubeNode: YouTubeNode,
  instagramNode: InstagramNode,
  audioNode: AudioNode,
  linkedinNode: LinkedinNode,
  xNode: XNode,
  redditNode: RedditNode,
  facebookNode: FacebookNode,
  googleBusinessNode: GoogleBusinessNode,
  googleSearchNode: GoogleSearchNode,
  adsInsightsNode: AdsInsightsNode,
  notionNode: NotionNode,
  googleWorkspaceNode: GoogleWorkspaceNode,

  // Integrations hub (2026-06 expansion) — one generic component, config by type
  mailchimpNode: IntegrationHubNode,
  hubspotNode: IntegrationHubNode,
  airtableNode: IntegrationHubNode,
  zohoNode: IntegrationHubNode,
  webflowNode: IntegrationHubNode,
  bloggerNode: IntegrationHubNode,
  wordpressNode: IntegrationHubNode,
  apolloNode: IntegrationHubNode,
  semrushNode: IntegrationHubNode,
  revenuecatNode: IntegrationHubNode,
  n8nNode: IntegrationHubNode,
  shopifyNode: IntegrationHubNode,
  stripeNode: IntegrationHubNode,

  // AI nodes
  aiChatbot: AIChatbotNode,
  generateImage: GenerateImageNode,
  generateVideo: GenerateVideoNode,
  promptNode: PromptNode,
  agenticNode: AgenticNode,
  chatbotNode: ChatbotNode,
  audioBotNode: AudioBotNode,

  // Output nodes
  documentNode: DocumentNode,
  publishNode: PublishNode,

  // Utility nodes
  stickyNote: StickyNoteNode,

  // Trigger nodes
  triggerWebhook: WebhookTriggerNode,
  triggerSchedule: ScheduleTriggerNode,
  triggerManual: ManualTriggerNode,
  triggerWhatsApp: WhatsAppTriggerNode,
  triggerEmail: EmailTriggerNode,
  triggerSocial: SocialTriggerNode,
  triggerKeyword: KeywordTriggerNode,
  triggerTelegram: TelegramTriggerNode,
  triggerIntegrationWebhook: IntegrationWebhookTriggerNode,
  triggerAdLead: AdLeadTriggerNode,

  // Logic nodes
  logicBranch: BranchNode,
  logicDelay: DelayNode,
  logicLoop: LoopNode,
  smartRouterNode: SmartRouterNode,

  // Action nodes
  actionWhatsApp: WhatsAppActionNode,
  actionWhatsAppButtons: WhatsAppActionNode,
  actionWhatsAppList: WhatsAppActionNode,
  actionMarketingEmail: MarketingEmailNode,
  actionConversationalEmail: ConversationalEmailNode,
  telegramNode: TelegramNode,

  // Integration nodes
  instagramDMNode: InstagramDMNode,
  httpRequestNode: HttpRequestNode,

  // CRM action nodes (one generic component, config by type)
  ...Object.fromEntries(CRM_ACTION_NODE_TYPES.map((t) => [t, CrmActionNode])),

  // Voice flow-builder nodes (one generic component, config by type)
  ...Object.fromEntries(VOICE_ACTION_NODE_TYPES.map((t) => [t, VoiceActionNode])),

  // Data-transform nodes (H7 / TODO 2.2) — one generic component, config by type
  ...Object.fromEntries(DATA_TRANSFORM_NODE_TYPES.map((t) => [t, DataTransformNode])),

  // Phase 3 nodes
  groupNode: GroupNode,
  subWorkflowNode: SubWorkflowNode,

  // Agent ↔ workflow ties (2.26)
  delegateToAgentNode: DelegateToAgentNode,
};
const edgeTypes: EdgeTypes = {
  'custom-edge': CustomEdge,
};

// Auto-save debounce delay in milliseconds
const AUTO_SAVE_DELAY = 5000;

interface CanvasEditorProps {
  canvasId: string;
  canvasName?: string;
  canvasData?: string; // JSON string of nodes/edges
  isCanvasLoading: boolean;
}

export function CanvasEditor({ canvasId, canvasName, canvasData, isCanvasLoading }: CanvasEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  // Inject dragHandle on every node so the header bar is the only drag surface
  const nodesWithDragHandle = useMemo(
    () => nodes.map(n => n.dragHandle ? n : { ...n, dragHandle: '.drag-handle' }),
    [nodes]
  );
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isInteractive, setIsInteractive] = useState(true);
  const [_lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [_advancedPanelNodeId, setAdvancedPanelNodeId] = useState<string | null>(null);
  // 1.9 "Test this step" result panel
  const [testStepOpen, setTestStepOpen] = useState(false);
  const [testStepLoading, setTestStepLoading] = useState(false);
  const [testStepLabel, setTestStepLabel] = useState<string | undefined>(undefined);
  const [testStepResult, setTestStepResult] = useState<TestStepResult | null>(null);
  const { data: session, status } = useSession();
  const { toast } = useToast();

  // Refs for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const hasUnsavedChangesRef = useRef(false);

  // Undo/Redo state
  const MAX_HISTORY = 50;
  const undoStackRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const redoStackRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const isUndoRedoRef = useRef(false);

  // Quick search state
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchPos, setQuickSearchPos] = useState({ x: 0, y: 0 });
  const lastPaneClickRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // Radial context menu
  const [radialMenu, setRadialMenu] = useState<{
    x: number; y: number; variant: RadialMenuVariant; nodeId?: string; edgeId?: string;
    pendingConnection?: { nodeId: string; handleId: string | null; handleType: string };
  } | null>(null);

  // Drag-to-empty-canvas: remember which handle started the connection
  const connectingFromRef = useRef<{ nodeId: string; handleId: string | null; handleType: string } | null>(null);

  // Copy / Paste clipboard
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // Load canvas data from props
  useEffect(() => {
    if (canvasData) {
      try {
        const flow = JSON.parse(canvasData);
        if (flow) {
          isInitialLoadRef.current = true;
          setNodes(flow.nodes || []);
          setEdges(flow.edges || []);
          // Mark initial load complete after a brief delay
          setTimeout(() => {
            isInitialLoadRef.current = false;
          }, 500);
        }
      } catch (e) {
        console.error("Failed to parse canvas data", e)
      }
    } else {
      // No canvas data - new canvas
      isInitialLoadRef.current = false;
    }
  }, [canvasData, setNodes, setEdges]);

  /**
   * Capture and upload preview in the background (non-blocking)
   */
  const capturePreviewInBackground = useCallback(async () => {
    if (!reactFlowWrapper.current || !session?.user || !(session.user as { id: string }).id) {
      return;
    }

    try {
      const containerElement = reactFlowWrapper.current;
      const dataUrl = await toPng(containerElement, {
        backgroundColor: theme === 'dark' ? '#09090b' : '#ffffff',
        cacheBust: true,
        pixelRatio: 0.5, // Lower resolution for faster capture
        skipFonts: true,
        filter: (node) => {
          const className = node.className;
          if (typeof className === 'string') {
            if (className.includes('react-flow__controls') ||
              className.includes('react-flow__minimap') ||
              className.includes('canvas-floating-toolbar') ||
              className.includes('canvas-right-toolbar')) {
              return false;
            }
          }
          // Skip external images
          if (node instanceof HTMLImageElement) {
            const src = node.src || '';
            if (src.startsWith('data:')) return true;
            try {
              const imgUrl = new URL(src);
              if (imgUrl.origin !== window.location.origin) return false;
            } catch {
              return false;
            }
          }
          return true;
        }
      });

      if (dataUrl) {
        await uploadCanvasPreview(canvasId, (session.user as { id: string }).id, dataUrl);
        console.log('[Canvas] Preview uploaded in background');
      }
    } catch (error) {
      // Silent failure for background preview - don't interrupt user
      console.error('[Canvas] Background preview capture failed:', error);
    }
  }, [canvasId, session, theme]);

  /**
   * Fast save - saves canvas data immediately
   * @param showToast - Whether to show success toast (false for auto-save)
   * @param capturePreview - Whether to capture preview image (false for auto-save, true for manual save)
   */
  const saveCanvasData = useCallback(async (showToast = true, capturePreview = true, saveKind: 'manual' | 'auto' = 'manual'): Promise<boolean> => {
    if (status !== 'authenticated') {
      if (showToast) {
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to save your canvas.',
          variant: 'destructive',
        });
      }
      return false;
    }

    if (!reactFlowInstance) return false;

    setIsSaving(true);

    try {
      const flow = reactFlowInstance.toObject();

      const canvasDataToSave = {
        data: JSON.stringify(flow),
        name: canvasName,
        saveKind,
      };

      const response = await fetch(`/api/v2/canvases/${canvasId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(canvasDataToSave),
      });

      if (!response.ok) {
        throw new Error('Failed to save canvas');
      }

      setLastSaved(new Date());
      hasUnsavedChangesRef.current = false;

      if (showToast) {
        toast({
          title: 'Canvas Saved',
          description: 'Your canvas has been saved.',
        });
      }

      // Only capture preview on manual save (not auto-save)
      if (capturePreview) {
        capturePreviewInBackground();
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to save canvas:', error);
      if (showToast) {
        toast({
          title: 'Save Failed',
          description: 'Could not save your canvas. Please try again.',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [reactFlowInstance, canvasId, canvasName, toast, status, capturePreviewInBackground]);

  /**
   * Manual save - called when user clicks save button
   */
  const saveCanvas = useCallback(async () => {
    // Clear any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    await saveCanvasData(true, true); // showToast=true, capturePreview=true
  }, [saveCanvasData]);

  /**
   * Rehydrate the editor from a restored version snapshot (JSON string of the
   * React Flow object). Replaces nodes/edges and resets undo history.
   */
  const handleRestoreVersion = useCallback((data: string) => {
    try {
      const flow = JSON.parse(data) as { nodes?: Node[]; edges?: Edge[] };
      isUndoRedoRef.current = true;
      setNodes(flow.nodes || []);
      setEdges(flow.edges || []);
      undoStackRef.current = [];
      redoStackRef.current = [];
      hasUnsavedChangesRef.current = false;
      requestAnimationFrame(() => { isUndoRedoRef.current = false; });
    } catch (err) {
      console.error('[Canvas] Failed to apply restored version:', err);
      toast({
        title: 'Restore failed',
        description: 'Could not apply the restored canvas state.',
        variant: 'destructive',
      });
    }
  }, [setNodes, setEdges, toast]);

  /**
   * Trigger auto-save with debounce
   */
  const triggerAutoSave = useCallback(() => {
    // Don't auto-save during initial load
    if (isInitialLoadRef.current) return;

    hasUnsavedChangesRef.current = true;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      console.log('[Canvas] Auto-saving...');
      saveCanvasData(false, false, 'auto').then(success => { // showToast=false, capturePreview=false, auto checkpoint
        if (success) {
          console.log('[Canvas] Auto-save complete');
        }
      });
    }, AUTO_SAVE_DELAY);
  }, [saveCanvasData]);

  // --- Undo/Redo ---
  const takeSnapshot = useCallback(() => {
    if (isInitialLoadRef.current || isUndoRedoRef.current) return;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-MAX_HISTORY + 1),
      { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) },
    ];
    redoStackRef.current = [];
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    redoStackRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    isUndoRedoRef.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
    triggerAutoSave();
  }, [nodes, edges, setNodes, setEdges, triggerAutoSave]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    isUndoRedoRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
    triggerAutoSave();
  }, [nodes, edges, setNodes, setEdges, triggerAutoSave]);

  // Keyboard shortcut listener for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  /**
   * Handle node changes with auto-save trigger
   */
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Snapshot before meaningful changes for undo
    const meaningfulChange = changes.some(change =>
      change.type === 'position' ||
      change.type === 'dimensions' ||
      change.type === 'remove' ||
      change.type === 'add'
    );

    if (meaningfulChange) {
      takeSnapshot();
    }

    onNodesChange(changes);

    if (meaningfulChange) {
      triggerAutoSave();
    }
  }, [onNodesChange, triggerAutoSave, takeSnapshot]);

  /**
   * Handle edge changes with auto-save trigger
   */
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const meaningfulChange = changes.some(change =>
      change.type === 'remove' || change.type === 'add'
    );

    if (meaningfulChange) {
      takeSnapshot();
    }

    onEdgesChange(changes);

    if (meaningfulChange) {
      triggerAutoSave();
    }
  }, [onEdgesChange, triggerAutoSave, takeSnapshot]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Save on page unload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (_e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current && reactFlowInstance && session?.user) {
        // Attempt to save before leaving
        const flow = reactFlowInstance.toObject();
        const payload = JSON.stringify({
          data: JSON.stringify(flow),
          name: canvasName,
        });

        // Use sendBeacon for reliable delivery
        navigator.sendBeacon(`/api/v2/canvases/${canvasId}`, payload);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [reactFlowInstance, canvasId, canvasName, session]);

  // Keyboard shortcut for save (Ctrl+S / Cmd+S) + Quick Search (/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save: Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCanvas();
        return;
      }

      // Quick Search: / key (only when not typing in an input)
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !isTyping && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const pos = lastPaneClickRef.current || { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
        setQuickSearchPos({ x: pos.clientX - 130, y: pos.clientY });
        setQuickSearchOpen(true);
        return;
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isTyping) {
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          const selectedIds = new Set(selectedNodes.map(n => n.id));
          const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
          clipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(internalEdges)),
          };
        }
        return;
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isTyping && clipboardRef.current) {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }

      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !isTyping) {
        e.preventDefault();
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          const selectedIds = new Set(selectedNodes.map(n => n.id));
          const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
          clipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(internalEdges)),
          };
          pasteFromClipboard();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveCanvas, nodes, edges]);

  /**
   * Paste nodes from clipboard with offset + new IDs
   */
  const pasteFromClipboard = useCallback(() => {
    if (!clipboardRef.current) return;
    takeSnapshot();

    const idMap = new Map<string, string>();
    const newNodes = clipboardRef.current.nodes.map(n => {
      const newId = `dndnode_${Date.now()}_${Math.random()}`;
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 50, y: n.position.y + 50 },
        selected: true,
      };
    });

    const newEdges = clipboardRef.current.edges.map(e => ({
      ...e,
      id: `edge_${Date.now()}_${Math.random()}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));

    // Deselect existing nodes
    setNodes(nds => [
      ...nds.map(n => ({ ...n, selected: false })),
      ...newNodes,
    ]);
    setEdges(eds => [...eds, ...newEdges]);
    triggerAutoSave();
  }, [setNodes, setEdges, triggerAutoSave, takeSnapshot]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'custom-edge', animated: true }, eds));
      triggerAutoSave();
    },
    [setEdges, triggerAutoSave]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    setTimeout(() => {
      instance.fitView({ padding: 0.2, maxZoom: 1 });
    }, 50);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      if (!isInteractive) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) {
        return;
      }

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const initialStyle = NODE_DIMENSIONS[type] || {};

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
        style: initialStyle,
      };

      setNodes((nds) => nds.concat(newNode));

      // Trigger auto-save after adding a new node
      triggerAutoSave();
    },
    [reactFlowInstance, setNodes, isInteractive, triggerAutoSave]
  );

  /**
   * Handle adding a node at a specific position (for quick search)
   */
  const handleAddNodeAtPosition = useCallback((type: string, position: { x: number; y: number }) => {
    if (!reactFlowInstance || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const flowPos = reactFlowInstance.project({
      x: position.x - bounds.left,
      y: position.y - bounds.top,
    });
    const initialStyle = NODE_DIMENSIONS[type] || {};
    const newNode: Node = {
      id: getId(),
      type,
      position: flowPos,
      data: { label: `${type} node` },
      style: initialStyle,
    };
    setNodes((nds) => nds.concat(newNode));
    triggerAutoSave();
  }, [reactFlowInstance, setNodes, triggerAutoSave]);

  /**
   * Handle adding a node from the toolbar
   */
  const handleAddNode = useCallback((type: string, data?: Record<string, unknown>) => {
    if (!reactFlowInstance) return;

    // Get viewport center
    const { x, y, zoom } = reactFlowInstance.getViewport();
    const centerX = (window.innerWidth / 2 - x) / zoom;
    const centerY = (window.innerHeight / 2 - y) / zoom;

    const initialStyle = NODE_DIMENSIONS[type] || {};

    const newNode: Node = {
      id: getId(),
      type,
      position: { x: centerX - 100, y: centerY - 50 },
      data: { label: `${type} node`, ...data },
      style: initialStyle,
    };

    setNodes((nds) => nds.concat(newNode));
    triggerAutoSave();
  }, [reactFlowInstance, setNodes, triggerAutoSave]);

  /**
   * Handle adding a sticky note
   */
  const handleAddStickyNote = useCallback(() => {
    const userName = session?.user?.name || 'Anonymous';
    const userAvatar = session?.user?.image || null;
    const timestamp = new Date().toISOString();

    handleAddNode('stickyNote', {
      content: '',
      color: '#FEF3C7',
      userName,
      userAvatar,
      timestamp,
      isExpanded: false
    });
  }, [handleAddNode, session]);

  /**
   * Handle node selection (no longer auto-opens sidebar — sidebar opens via ⚙️ icon)
   */
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'stickyNote') return;
    setSelectedNode(node);
  }, []);

  /**
   * Listen for 'open-node-advanced' custom events dispatched from NodeShell's ⚙️ button
   */
  useEffect(() => {
    const handleOpenAdvanced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.nodeId) {
        const node = nodes.find(n => n.id === detail.nodeId);
        if (node) {
          setSelectedNode(node);
          setAdvancedPanelNodeId(detail.nodeId);
          setIsSidebarOpen(true);
        }
      }
    };

    window.addEventListener('open-node-advanced', handleOpenAdvanced);
    return () => window.removeEventListener('open-node-advanced', handleOpenAdvanced);
  }, [nodes]);

  /**
   * Handle sidebar close
   */
  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setSelectedNode(null);
    setAdvancedPanelNodeId(null);
  }, []);

  /**
   * Handle pane click (clicking on canvas background)
   */
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // Track click position for quick search
    lastPaneClickRef.current = { clientX: event.clientX, clientY: event.clientY };
    // Close quick search
    if (quickSearchOpen) setQuickSearchOpen(false);
    // Close sidebar when clicking on canvas
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      setSelectedNode(null);
      setAdvancedPanelNodeId(null);
    }
  }, [isSidebarOpen, quickSearchOpen]);

  /**
   * Handle selection change
   */
  const handleSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    if (params.nodes.length === 0 && isSidebarOpen) {
      setIsSidebarOpen(false);
      setSelectedNode(null);
      setAdvancedPanelNodeId(null);
    }
  }, [isSidebarOpen]);

  /**
   * Handle node deletion from sidebar
   */
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    handleCloseSidebar();
    triggerAutoSave();
  }, [setNodes, setEdges, handleCloseSidebar, triggerAutoSave]);

  /**
   * Handle node duplication from sidebar
   */
  const handleDuplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find((n) => n.id === nodeId);
    if (!nodeToDuplicate) return;

    const newNode: Node = {
      ...nodeToDuplicate,
      id: getId(),
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50,
      },
      selected: false,
    };

    setNodes((nds) => nds.concat(newNode));
    triggerAutoSave();
  }, [nodes, setNodes, triggerAutoSave]);

  /**
   * 1.9 "Test this step" — run a single node in isolation (dry-run, no real
   * sends) and show its output in a result dialog. Saves first so the server's
   * UnifiedWorkflow shadow reflects current node config.
   */
  const handleTestStep = useCallback(async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    setTestStepLabel((node?.data?.label as string) || node?.type || nodeId);
    setTestStepResult(null);
    setTestStepLoading(true);
    setTestStepOpen(true);
    try {
      // Persist current graph so the server shadow has the latest config.
      await saveCanvasData(false, false).catch(() => { /* best-effort */ });
      const res = await fetch(`/api/v2/canvases/${canvasId}/test-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestStepResult({ nodeId, error: data?.error || data?.detail || 'Test failed' });
      } else {
        setTestStepResult(data as TestStepResult);
      }
    } catch (err) {
      setTestStepResult({ nodeId, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestStepLoading(false);
    }
  }, [nodes, canvasId, saveCanvasData]);

  /**
   * Listen for 'node-action' custom events dispatched from NodeShell control buttons
   */
  useEffect(() => {
    const handleNodeAction = (e: Event) => {
      const { nodeId, action } = (e as CustomEvent).detail ?? {};
      if (!nodeId || !action) return;

      switch (action) {
        case 'run':
          handleTestStep(nodeId);
          break;
        case 'delete':
          handleDeleteNode(nodeId);
          break;
        case 'duplicate':
          handleDuplicateNode(nodeId);
          break;
        case 'disable':
          setNodes(nds => nds.map(n =>
            n.id === nodeId ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n
          ));
          triggerAutoSave();
          break;
        case 'lock':
          setNodes(nds => nds.map(n =>
            n.id === nodeId
              ? { ...n, draggable: n.draggable !== false, data: { ...n.data, locked: !n.data.locked } }
              : n
          ));
          triggerAutoSave();
          break;
        case 'settings': {
          const node = nodes.find(n => n.id === nodeId);
          if (node) {
            setSelectedNode(node);
            setAdvancedPanelNodeId(nodeId);
            setIsSidebarOpen(true);
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('node-action', handleNodeAction);
    return () => window.removeEventListener('node-action', handleNodeAction);
  }, [nodes, handleDeleteNode, handleDuplicateNode, handleTestStep, setNodes, triggerAutoSave]);

  const handleConnectStart = useCallback((_: unknown, params: { nodeId?: string | null; handleId?: string | null; handleType?: string | null }) => {
    connectingFromRef.current = {
      nodeId:     params.nodeId     ?? '',
      handleId:   params.handleId   ?? null,
      handleType: params.handleType ?? 'source',
    };
  }, []);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.target as HTMLElement;
    if (target?.classList.contains('react-flow__pane') && connectingFromRef.current) {
      setRadialMenu({
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        variant: 'pane',
        pendingConnection: connectingFromRef.current,
      });
    }
    connectingFromRef.current = null;
  }, []);

  /**
   * Single context menu handler on the wrapper div — more reliable than ReactFlow's
   * onPaneContextMenu/onNodeContextMenu/onEdgeContextMenu in v11.
   * Walks the DOM from the click target to detect node or edge elements.
   */
  const handleWrapperContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;

    const nodeEl = target.closest('.react-flow__node') as HTMLElement | null;
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-id');
      if (nodeId) {
        setRadialMenu({ x: e.clientX, y: e.clientY, variant: 'node', nodeId });
        return;
      }
    }

    const edgeEl = target.closest('.react-flow__edge');
    if (edgeEl) {
      const testId = edgeEl.getAttribute('data-testid') ?? '';
      const edgeId = testId.replace('rf__edge-', '');
      if (edgeId) {
        setRadialMenu({ x: e.clientX, y: e.clientY, variant: 'edge', edgeId });
        return;
      }
    }

    setRadialMenu({ x: e.clientX, y: e.clientY, variant: 'pane' });
  }, []);

  /**
   * Dispatch actions selected in the radial menu
   */
  const handleRadialAction = useCallback((action: string) => {
    if (!radialMenu) return;
    const { variant, nodeId, edgeId } = radialMenu;

    if (variant === 'pane') {
      if (action === 'add-node') {
        setQuickSearchPos({ x: radialMenu.x - 130, y: radialMenu.y });
        setQuickSearchOpen(true);
      } else if (action === 'paste') {
        pasteFromClipboard();
      } else if (action === 'fit-view') {
        reactFlowInstance?.fitView({ padding: 0.2 });
      } else if (action === 'select-all') {
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
      }
    } else if (variant === 'node' && nodeId) {
      if (action === 'delete') {
        handleDeleteNode(nodeId);
      } else if (action === 'duplicate') {
        handleDuplicateNode(nodeId);
      } else if (action === 'disable') {
        setNodes(nds => nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n
        ));
        triggerAutoSave();
      } else if (action === 'settings') {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          setSelectedNode(node);
          setAdvancedPanelNodeId(nodeId);
          setIsSidebarOpen(true);
        }
      }
    } else if (variant === 'edge' && edgeId) {
      if (action === 'delete') {
        setEdges(eds => eds.filter(e => e.id !== edgeId));
        triggerAutoSave();
      }
    }
  }, [
    radialMenu, nodes,
    handleDeleteNode, handleDuplicateNode,
    setNodes, setEdges, triggerAutoSave,
    reactFlowInstance, pasteFromClipboard,
    setQuickSearchPos, setQuickSearchOpen,
  ]);

  /**
   * Handle node data update from sidebar
   */
  const handleUpdateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
    );
    triggerAutoSave();
  }, [setNodes, triggerAutoSave]);

  /**
   * Handle AI Workflow Generation result from the dialog
   * The dialog handles the SSE stream and returns validated {nodes, edges}
   */
  const handleWorkflowGenerated = useCallback((result: { nodes: Node[]; edges: Edge[] }) => {
    try {
      const newNodes = result.nodes.map((n) => ({
        ...n,
        data: { label: `${n.type} node`, ...n.data },
      }));

      setNodes(newNodes);
      setEdges(result.edges);

      // Fit view to the new nodes
      if (reactFlowInstance) {
        setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
      }

      triggerAutoSave();
    } catch (error) {
      console.error('Failed to apply workflow:', error);
      toast({
        title: 'Application Failed',
        description: 'Could not apply the generated workflow to the canvas.',
        variant: 'destructive',
      });
    }
  }, [setNodes, setEdges, toast, reactFlowInstance, triggerAutoSave]);

  if (isCanvasLoading || status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/10">
        <div className="w-full h-full relative">
          <Skeleton className="w-full h-full" />
          <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium">Loading canvas...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/10">
        <div className="text-center p-6 rounded-xl bg-card border shadow-sm">
          <p className="text-muted-foreground">Please sign in to view this canvas.</p>
        </div>
      </div>
    );
  }

  const isDark = theme === 'dark';

  return (
    <div className="flex h-full w-full bg-[#F5F5F5] dark:bg-neutral-900/20 text-foreground overflow-hidden">
      <ExecutionProvider>
        <ReactFlowProvider>
          <div className="flex-1 h-full relative" ref={reactFlowWrapper} onContextMenu={handleWrapperContextMenu}>
            <ReactFlow
              nodes={nodesWithDragHandle}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onInit={onInit}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onSelectionChange={handleSelectionChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: 'custom-edge', animated: true }}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd as OnConnectEnd}
              snapToGrid={true}
              snapGrid={[8, 8] as [number, number]}
              connectionRadius={36}
              minZoom={0.1}
              maxZoom={4}
              zoomOnScroll={true}
              panOnScroll={false}
              className="bg-neutral-50/50 dark:bg-neutral-900/20"
            >
              {/* React Flow Controls - Bottom Left */}
              <div className="absolute bottom-6 left-6 z-10">
                <Controls
                  showInteractive={true}
                  onInteractiveChange={(interactive) => setIsInteractive(interactive)}
                  className="flex p-1 border border-border/40 rounded-full bg-background/60 backdrop-blur-xl shadow-xl m-0 [&>button]:border-none [&>button]:bg-transparent [&>button]:rounded-full [&>button:hover]:bg-muted/50 [&>button>svg]:fill-foreground/80 dark:[&>button>svg]:fill-foreground/80"
                />
              </div>

              {/* MiniMap with maximize icon overlay */}
              <div className="absolute bottom-6 right-6 z-10 transition-all duration-300 ease-in-out size-16 hover:w-64 hover:h-48 overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur-xl shadow-xl group">
                {/* Maximize icon - visible when small, hidden on hover */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity duration-200 z-10">
                  <Maximize2 className="size-5 text-muted-foreground" />
                </div>
                <MiniMap
                  className="!static w-full h-full m-0 bg-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  maskColor={isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)"}
                  nodeColor={(n) => CATEGORY_THEME[categoryFor(n.type ?? '')].accent}
                  zoomable
                  pannable
                />
              </div>

              <Background
                gap={15}
                size={0.8}
                color={isDark ? "#ffffff" : "#000000"}
                className="opacity-[0.25] dark:opacity-[0.2]"
              />
              <CanvasToolbar
                onAddNode={handleAddNode}
                onAddStickyNote={handleAddStickyNote}
                onSave={() => saveCanvasData(true, true)}
                isSaving={isSaving}
                onWorkflowGenerated={handleWorkflowGenerated}
                onRestoreVersion={handleRestoreVersion}
                canvasId={canvasId}
                canvasName={canvasName}
              />

              {/* Quick Node Search */}
              {quickSearchOpen && (
                <QuickNodeSearch
                  position={quickSearchPos}
                  onSelect={(type) => {
                    handleAddNodeAtPosition(type, quickSearchPos);
                    setQuickSearchOpen(false);
                  }}
                  onClose={() => setQuickSearchOpen(false)}
                />
              )}

              {/* Execution Controls - Top Right */}
              <CanvasExecutionControl canvasId={canvasId} />

              {/* Empty-canvas onboarding (TODO 2.15) — only when there are no
                  nodes and the canvas is editable. Dismisses automatically once
                  a node exists (this stops rendering). */}
              {nodes.length === 0 && isInteractive && <EmptyCanvasOnboarding />}
            </ReactFlow>
          </div>

          {/* Right sidebar for node configuration */}
          {isSidebarOpen && (
            <NodeConfigSidebar
              selectedNode={selectedNode}
              onClose={handleCloseSidebar}
              onDelete={handleDeleteNode}
              onDuplicate={handleDuplicateNode}
              onUpdateNodeData={handleUpdateNodeData}
            />
          )}
        </ReactFlowProvider>
      </ExecutionProvider>

      {/* Radial context menu — rendered outside ReactFlow to avoid clipping */}
      {radialMenu && (
        <RadialMenu
          x={radialMenu.x}
          y={radialMenu.y}
          variant={radialMenu.variant}
          onClose={() => setRadialMenu(null)}
          onAction={handleRadialAction}
        />
      )}

      {/* 1.9 "Test this step" result panel */}
      <TestStepResultDialog
        open={testStepOpen}
        onOpenChange={setTestStepOpen}
        loading={testStepLoading}
        nodeLabel={testStepLabel}
        result={testStepResult}
      />
    </div>
  );
}

