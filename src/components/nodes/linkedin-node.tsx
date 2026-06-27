
'use client';

import React, { useCallback, memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell from './node-shell';
import { Loader2, ArrowDownToLine, Send, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { LinkedinLogo } from '../social-icons';
import { validateSocialUrl } from '@/lib/url-validators';
import NodeHandle from './node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type LinkedInMode = 'single_post' | 'profile' | 'post';

const LinkedinNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

  const [mode, setMode] = useState<LinkedInMode>(data.linkedinMode || 'single_post');
  const [urlInput, setUrlInput] = useState(data.url || '');
  const [lastNPosts, setLastNPosts] = useState(data.lastNPosts || 10);
  const [caption, setCaption] = useState(data.caption || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleScrape = useCallback(async () => {
    if (!urlInput) {
      toast({ variant: 'destructive', title: 'Missing URL', description: 'Please enter a LinkedIn URL.' });
      return;
    }

    const validation = validateSocialUrl(urlInput, 'linkedin');
    if (!validation.isValid) {
      toast({ variant: 'destructive', title: 'Invalid URL', description: validation.error || 'Please enter a valid LinkedIn URL.' });
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'single_post') {
        // Single post scraping via Apify
        updateNodeData({
          url: urlInput,
          linkedinMode: mode,
          text: `[Scrape pending] Single post: ${urlInput}`,
        });
        toast({ title: 'Post URL saved', description: 'LinkedIn post configured for scraping.' });
      } else if (mode === 'profile') {
        // Profile scraping — last N posts via Apify
        updateNodeData({
          url: urlInput,
          linkedinMode: mode,
          lastNPosts,
          text: `[Scrape pending] Profile: ${urlInput}, last ${lastNPosts} posts`,
        });
        toast({ title: 'Profile configured', description: `Will scrape last ${lastNPosts} posts from this profile.` });
      }
    } finally {
      setIsLoading(false);
    }
  }, [urlInput, mode, lastNPosts, updateNodeData, toast]);

  const handlePost = useCallback(async () => {
    const content = caption || getIncomingContent();
    if (!content) {
      toast({ variant: 'destructive', title: 'No content', description: 'Write a caption or connect a content node.' });
      return;
    }

    setIsLoading(true);
    try {
      updateNodeData({
        caption: content,
        linkedinMode: 'post',
      });
      toast({ title: 'Post configured', description: 'LinkedIn post ready for execution.' });
    } finally {
      setIsLoading(false);
    }
  }, [caption, getIncomingContent, updateNodeData, toast]);

  return (
    <NodeShell
      id={id}
      nodeType="linkedinNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      contentClassName="p-3 relative"
      title="LinkedIn"
      icon={<LinkedinLogo className="h-full w-full" />}
    >
      {isLoading && <Loader2 className="size-4 animate-spin absolute top-4 right-4 z-10" />}

      <div className="nodrag space-y-3">
        {/* Mode Toggle */}
        <div className="flex bg-muted/30 p-0.5 rounded-xl">
          <button
            type="button"
            className={cn(
              'flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1',
              mode === 'single_post'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setMode('single_post')}
          >
            <ArrowDownToLine className="size-3" />
            Post
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1',
              mode === 'profile'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setMode('profile')}
          >
            <User className="size-3" />
            Profile
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1',
              mode === 'post'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setMode('post')}
          >
            <Send className="size-3" />
            Publish
          </button>
        </div>

        {/* Scrape Modes */}
        {(mode === 'single_post' || mode === 'profile') && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {mode === 'single_post' ? 'Post URL' : 'Profile URL'}
              </Label>
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScrape(); }}
                placeholder={mode === 'single_post' ? 'https://linkedin.com/posts/...' : 'https://linkedin.com/in/username'}
                className="h-9 rounded-xl text-xs"
              />
            </div>

            {mode === 'profile' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Last N Posts</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={lastNPosts}
                    onChange={(e) => setLastNPosts(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="h-9 rounded-xl text-xs w-20"
                  />
                  <span className="text-xs text-muted-foreground">posts (1-50)</span>
                </div>
              </div>
            )}

            <Button
              size="sm"
              className="w-full h-8 text-xs rounded-xl"
              onClick={handleScrape}
              disabled={isLoading || !urlInput}
            >
              <ArrowDownToLine className="size-3 mr-1.5" />
              {mode === 'single_post' ? 'Scrape Post' : `Scrape Last ${lastNPosts} Posts`}
            </Button>
          </div>
        )}

        {/* Post Mode */}
        {mode === 'post' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account</Label>
              <Select>
                <SelectTrigger className="h-8 text-xs rounded-xl">
                  <SelectValue placeholder="Select LinkedIn account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connect">Connect LinkedIn →</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Caption</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your post or connect a node..."
                className="min-h-[60px] text-xs resize-none rounded-xl"
                rows={3}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs rounded-xl"
              onClick={handlePost}
              disabled={isLoading}
            >
              <Send className="size-3 mr-1.5" />
              Configure Post
            </Button>
          </div>
        )}

        {/* Saved URL Preview */}
        {data.url && (mode === 'single_post' || mode === 'profile') && (
          <div className="rounded-xl bg-muted/30 border border-border/40 p-2">
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">
              {data.url}
            </a>
            {mode === 'profile' && data.lastNPosts && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Scraping last {data.lastNPosts} posts
              </p>
            )}
          </div>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="linkedinNode" isConnectable={isConnectable} id="data-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="linkedinNode" isConnectable={isConnectable} />

    </NodeShell>
  );
};

export default memo(LinkedinNode);
