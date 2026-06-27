'use client';

import React, { useCallback, memo, useState, useRef, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell, { NodeControlBar } from './node-shell';
import { type ModelOption } from './model-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Loader2, Send, RotateCcw, Save, BrainCircuit, Wand2 } from 'lucide-react';
import { summarizeChatHistory, streamChatResponse } from '@/ai/flows';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { CoreMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import NodeHandle from './node-handle';

const SUMMARY_THRESHOLD = 15;
const RECENT_MESSAGES_COUNT = 8;

function ChatMessageList({ messages, isLoading }: { messages: CoreMessage[]; isLoading: boolean }) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}`} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
          {message.role === 'assistant' && (
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Bot className="size-4 text-primary" />
            </div>
          )}
          <div className={`rounded-2xl px-4 py-2 text-sm shadow-sm max-w-[85%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/80 backdrop-blur-sm'}`}>
            {message.role === 'assistant' ? (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode } & React.HTMLAttributes<HTMLElement>) =>
                      inline ? (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                      ) : (
                        <code className="block" {...props}>{children}</code>
                      ),
                  }}
                >
                  {message.content as string}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{message.content as string}</p>
            )}
          </div>
          {message.role === 'user' && (
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
              <User className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
      {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="flex items-start gap-3">
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <Bot className="size-4 text-primary" />
          </div>
          <div className="rounded-2xl px-4 py-2 text-sm bg-muted/80 backdrop-blur-sm flex items-center shadow-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}


const AIChatbotNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

  const [messages, setMessages] = useState<CoreMessage[]>(data.messages || []);
  const [conversationSummary, setConversationSummary] = useState<string>(data.conversationSummary || '');
  const [lastSummarizedIndex, setLastSummarizedIndex] = useState<number>(data.lastSummarizedIndex === undefined ? -1 : data.lastSummarizedIndex);

  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  const triggerSummarization = async (currentMessages: CoreMessage[]) => {
    if (currentMessages.length > SUMMARY_THRESHOLD && lastSummarizedIndex < currentMessages.length - RECENT_MESSAGES_COUNT) {

      const newMessagesToSummarize = currentMessages.slice(lastSummarizedIndex + 1, -RECENT_MESSAGES_COUNT);
      if (newMessagesToSummarize.length === 0) return;

      try {
        const result = await summarizeChatHistory({
          history: newMessagesToSummarize.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
          currentSummary: conversationSummary,
        });

        const newSummary = result.summary;
        const newLastSummarizedIndex = currentMessages.length - RECENT_MESSAGES_COUNT - 1;

        setConversationSummary(newSummary);
        setLastSummarizedIndex(newLastSummarizedIndex);
        updateNodeData({ conversationSummary: newSummary, lastSummarizedIndex: newLastSummarizedIndex });

        toast({ title: 'Conversation memory updated', description: 'The AI has summarized the older parts of your chat.' });
      } catch (error) {
        console.error("Summarization failed:", error);
      }
    }
  };

  const handleSend = async () => {
    if (!userInput.trim() || !data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model and enter a message.' });
      return;
    }

    const userMessage: CoreMessage = { role: 'user', content: userInput };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    updateNodeData({ messages: updatedMessages });

    const currentInput = userInput;
    setUserInput('');
    setIsLoading(true);

    try {
      const context = getIncomingContent();

      const historyForPrompt: CoreMessage[] = [];

      if (conversationSummary) {
        historyForPrompt.push({
          role: 'assistant',
          content: `Previous conversation summary: ${conversationSummary}`
        });
      }

      const recentMessages = updatedMessages.slice(lastSummarizedIndex + 1, -1);
      historyForPrompt.push(...recentMessages);

      const stream = await streamChatResponse({
        context,
        prompt: currentInput,
        history: historyForPrompt.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
        model: data.selectedModel,
        routeHint: data.selectedModelRouteHint,
        stream: true,
        useKnowledgeBase: !!data.useKnowledgeBase,
        useAgentActions: !!data.useAgentActions,
      });

      const assistantMessage: CoreMessage = { role: 'assistant', content: '' };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);

      for await (const chunk of stream) {
        assistantMessage.content += chunk;
        setMessages([...updatedMessages, { ...assistantMessage }]);
        updateNodeData({ messages: [...updatedMessages, { ...assistantMessage }] });
      }

      triggerSummarization(finalMessages);

    } catch (error) {
      console.error("Chatbot failed:", error);
      toast({
        variant: 'destructive',
        title: 'Chatbot Error',
        description: error instanceof Error ? error.message : 'Could not generate a response.'
      });
      setMessages(updatedMessages); // Revert to messages before the failed attempt
    } finally {
      setIsLoading(false);
    }
  };


  const onClearHistory = useCallback(() => {
    setMessages([]);
    setConversationSummary('');
    setLastSummarizedIndex(-1);
    updateNodeData({ messages: [], conversationSummary: '', lastSummarizedIndex: -1 });
    toast({ title: "History Cleared", description: "The chatbot's memory has been reset." });
  }, [updateNodeData, toast]);

  const onSaveToChat = useCallback(async () => {
    if (messages.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'No messages to save.' });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/v2/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Canvas Chat - ${new Date().toLocaleDateString()}`,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            model: m.role === 'assistant' ? data.selectedModel : undefined,
            timestamp: new Date().toISOString(),
          })),
          lastModel: data.selectedModel,
          lastModelRouteHint: data.selectedModelRouteHint,
        }),
      });

      if (!response.ok) throw new Error('Failed to save conversation');

      const conversation = await response.json();
      toast({
        title: 'Saved to Chat',
        description: (
          <span>
            Conversation saved.{' '}
            <a href={`/chat/${conversation._id}`} className="underline font-medium">
              Open in Chat
            </a>
          </span>
        ),
      });
    } catch (error) {
      console.error('Failed to save to chat:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not save conversation to Chat.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [messages, data.selectedModel, data.selectedModelRouteHint, toast]);

  const handleModelChange = (_value: string, model: ModelOption) => {
    updateNodeData({ selectedModel: model.id, selectedModelRouteHint: model.routeHint });
    toast({
      title: "Model Switched",
      description: `Now using ${model.name}.`
    });
  };

  const chatbotHeaderActions = (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        onClick={() => updateNodeData({ useAgentActions: !data.useAgentActions })}
        variant={data.useAgentActions ? "default" : "ghost"}
        size="icon"
        className={`size-6 rounded-full transition-colors ${data.useAgentActions ? 'bg-primary/20 text-indigo-500 hover:bg-primary/30' : ''}`}
        title={data.useAgentActions ? "Agent Actions Enabled" : "Allow AI to run Tools"}
      >
        <Wand2 className="size-3" />
      </Button>
      <Button
        type="button"
        onClick={() => updateNodeData({ useKnowledgeBase: !data.useKnowledgeBase })}
        variant={data.useKnowledgeBase ? "default" : "ghost"}
        size="icon"
        className={`size-6 rounded-full transition-colors ${data.useKnowledgeBase ? 'bg-primary/20 text-primary hover:bg-primary/30' : ''}`}
        title={data.useKnowledgeBase ? "Knowledge Base Enabled" : "Read from Knowledge Base"}
      >
        <BrainCircuit className="size-3" />
      </Button>
      <Button
        type="button"
        onClick={onSaveToChat}
        variant="ghost"
        size="icon"
        className="size-6 rounded-full"
        disabled={isSaving || messages.length === 0}
        title="Save to Chat"
      >
        {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
      </Button>
      <Button type="button" onClick={onClearHistory} variant="ghost" size="icon" className="size-6 rounded-full" title="Clear History">
        <RotateCcw className="size-3" />
      </Button>
    </div>
  );

  return (
    <NodeShell
      id={id}
      nodeType="aiChatbot"
      selected={selected}
      onDelete={deleteNode}
      minWidth={320}
      minHeight={400}
      className="flex flex-col"
      contentClassName="p-0 flex flex-col"
      headerActions={chatbotHeaderActions}
      title="AI Chatbot"
      icon={<Bot className="h-full w-full" />}
    >
      <div className="nodrag flex flex-col h-full min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <ChatMessageList messages={messages} isLoading={isLoading} />
        </ScrollArea>
        <div className="px-4 pb-4">
          <NodeControlBar
            modelValue={data.selectedModel}
            onModelChange={handleModelChange}
            modelType="text"
            onAction={handleSend}
            actionIcon={<Send className="size-4" />}
            isLoading={isLoading}
            actionDisabled={!userInput.trim()}
          >
            <Input
              placeholder="Ask a question..."
              className="flex-1 rounded-full bg-muted/50 border-border/50 focus:bg-background transition-all"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={isLoading}
            />
          </NodeControlBar>
        </div>
      </div>

      <NodeHandle type="target" position={Position.Left} nodeType="aiChatbot" isConnectable={isConnectable} id="context-input" />
      <NodeHandle type="source" position={Position.Right} nodeType="aiChatbot" isConnectable={isConnectable} id="response-output" />
    </NodeShell>
  );
};

export default memo(AIChatbotNode);
