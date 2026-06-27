'use client';

import React, { memo, useState, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import NodeShell from './node-shell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Instagram, Youtube, ChevronLeft, ChevronRight, CalendarPlus, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FacebookLogo, LinkedinLogo, RedditLogo, XLogo } from '../social-icons';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useUser } from '@/hooks/use-user';
import useSWR from 'swr';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import NodeHandle from './node-handle';

type Channel = 'instagram' | 'linkedin' | 'x' | 'facebook' | 'youtube' | 'reddit';

interface BrandLite {
  _id: string;
  name: string;
}
interface AccountLite {
  platform: string;
}
interface PublishNodeData {
  caption?: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  selectedChannels?: Channel[];
  brandId?: string;
}

// Fetcher function
const fetcher = (url: string) => fetch(url).then((res) => res.json());

const socialChannels = [
  { id: 'instagram', name: 'Instagram', icon: Instagram },
  { id: 'linkedin', name: 'LinkedIn', icon: LinkedinLogo },
  { id: 'x', name: 'X', icon: XLogo },
  { id: 'facebook', name: 'Facebook', icon: FacebookLogo },
  { id: 'youtube', name: 'YouTube', icon: Youtube },
  { id: 'reddit', name: 'Reddit', icon: RedditLogo },
] as const;


interface SocialPreviewProps {
  channel: typeof socialChannels[number];
  caption: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  userAvatarUrl?: string;
}

const SocialPreview = ({ channel, caption, mediaUrl, mediaType, userAvatarUrl }: SocialPreviewProps) => {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <channel.icon className="size-5" />
        <h3 className="font-semibold">{channel.name} Preview</h3>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Avatar>
              <AvatarImage src={userAvatarUrl} />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">Your Brand</p>
              <p className="text-xs text-muted-foreground">Just now</p>
            </div>
          </div>
          <p className="text-sm my-3 whitespace-pre-wrap">{caption || "Your caption will appear here..."}</p>
          {mediaUrl && (
            <div className="aspect-square relative w-full bg-muted rounded-md overflow-hidden mt-2">
              {mediaType === 'image' && <Image src={mediaUrl} alt="Post preview" layout="fill" objectFit="cover" />}
              {mediaType === 'video' && <video src={mediaUrl} controls className="w-full h-full object-cover" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const PublishNode = ({ id, data, isConnectable, selected }: NodeProps<PublishNodeData>) => {
  const { getNodes, getEdges } = useReactFlow();
  const { toast } = useToast();
  const { user } = useUser();
  const { updateNodeData, deleteNode } = useNodeUtils(id);

  const [caption, setCaption] = useState(data.caption || '');
  const [mediaUrl, setMediaUrl] = useState<string | null>(data.mediaUrl || null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(data.mediaType || null);
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(data.selectedChannels || []);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(data.brandId || '');
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(true);

  const userAvatar = PlaceHolderImages.find((img) => img.id === 'user-avatar-1');

  // Fetch Brands
  const { data: brandsData } = useSWR('/api/social/brands', fetcher);
  const brands: BrandLite[] = React.useMemo(() => brandsData?.brands || [], [brandsData]);

  // Fetch Accounts for selected brand
  const { data: accountsData } = useSWR(
    selectedBrandId ? `/api/social/brands/${selectedBrandId}/accounts` : null,
    fetcher
  );

  // Derived connected channels
  const connectedChannels = React.useMemo<string[]>(() => {
    const accounts: AccountLite[] = accountsData?.accounts || [];
    return accounts.map((acc) => {
      if (acc.platform === 'twitter') return 'x';
      return acc.platform;
    });
  }, [accountsData]);

  // Set default brand
  useEffect(() => {
    // Create a flag to track if we've already set the default brand to avoid loop or override
    // But here we just want to ensure if brandId is empty, we pick the first one.
    if (!selectedBrandId && brands.length > 0) {
      const defaultBrand = brands[0];
      setSelectedBrandId(defaultBrand._id);
    }
  }, [brands, selectedBrandId]);

  // Update node data when local state changes
  useEffect(() => {
    updateNodeData({ caption, mediaUrl, mediaType, selectedChannels, brandId: selectedBrandId });
  }, [caption, mediaUrl, mediaType, selectedChannels, selectedBrandId, updateNodeData]);

  // This effect will listen for incoming data from connected nodes
  useEffect(() => {
    const nodes = getNodes();
    const edges = getEdges();

    // Find edges connected to THIS node
    const connectedEdges = edges.filter(edge => edge.target === id);

    let newCaption = '';
    let newMediaUrl = null;
    let newMediaType: 'image' | 'video' | null = null;

    connectedEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return;

      // If connected to the TEXT handle
      if (edge.targetHandle === 'text-input') {
        const text = sourceNode.data.text ||
          sourceNode.data.content ||
          sourceNode.data.transcript ||
          sourceNode.data.markdownContent ||
          (sourceNode.type === 'promptNode' ? sourceNode.data.output : '') || // Handle AI text output
          '';
        if (text) newCaption = text;
      }

      // If connected to the MEDIA handle
      if (edge.targetHandle === 'media-input') {
        if (sourceNode.data.imageUrl) {
          newMediaUrl = sourceNode.data.imageUrl;
          newMediaType = 'image';
        } else if (sourceNode.data.videoUrl) {
          newMediaUrl = sourceNode.data.videoUrl;
          newMediaType = 'video';
        } else if (sourceNode.type === 'generateImage' && sourceNode.data.generatedImages?.length > 0) {
          // specific handling for generateImage node which might have array
          newMediaUrl = sourceNode.data.generatedImages[0];
          newMediaType = 'image';
        }
      }
    });

    if (newCaption && newCaption !== caption) {
      setCaption(newCaption);
    }

    if (newMediaUrl && newMediaUrl !== mediaUrl) {
      setMediaUrl(newMediaUrl);
      setMediaType(newMediaType);
    }

  }, [getNodes, getEdges, id, caption, mediaUrl]); // Re-run when graph changes

  const toggleChannel = (channel: Channel) => {
    // Prevent selecting unconnected channels
    if (!connectedChannels.includes(channel) && channel !== 'x' && channel !== 'instagram' && channel !== 'linkedin') {
      // Note: allowing some strictly for demo if backend isn't ready, but generally should block.
      // For this task strict verification:
    }

    if (!connectedChannels.includes(channel)) {
      toast({
        variant: "destructive",
        title: "Channel Not Connected",
        description: `Please connect your ${channel} account in Settings > Connections first.`
      });
      return;
    }

    setSelectedChannels(prev =>
      prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]
    );
  };

  const handlePublish = async () => {
    if (selectedChannels.length === 0) {
      toast({ variant: 'destructive', title: 'No Channels Selected', description: 'Please select at least one social channel to publish to.' });
      return;
    }
    if (!selectedBrandId) {
      toast({ variant: 'destructive', title: 'No Brand Selected', description: 'Please select a brand.' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'Not Authenticated', description: 'You must be logged in to publish posts.' });
      return;
    }

    const newPost = {
      userId: user.uid,
      brandId: selectedBrandId,
      caption,
      mediaUrl,
      mediaType,
      channels: selectedChannels,
      status: 'published',
      publishedAt: new Date().toISOString(),
    };

    try {
      // Using API endpoint to save post
      const res = await fetch('/api/v2/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost)
      });

      if (!res.ok) throw new Error("Failed to publish post via API");

      toast({
        title: 'Post Published!',
        description: `Your post has been saved and is now visible on your social calendar.`,
      });
    } catch (error) {
      console.error("Failed to save post:", error);
      toast({
        variant: 'destructive',
        title: 'Publishing Failed',
        description: error instanceof Error ? error.message : "Could not save the post to the database."
      });
    }
  };

  // Get current brand object (reserved for future use)
  // const _currentBrand = brands.find((b) => b._id === selectedBrandId);

  const previewToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8")}
      onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
    >
      {isPreviewCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  );

  return (
    <NodeShell
      id={id}
      nodeType="publishNode"
      selected={selected}
      onDelete={deleteNode}
      minWidth={416}
      minHeight={600}
      className="flex flex-col"
      contentClassName="flex flex-row p-0 overflow-hidden h-full"
      title="Publish"
      icon={<Send className="h-full w-full" />}
      headerActions={previewToggle}
    >
      {/* Left Panel */}
      <div className={cn(
        "p-4 transition-all duration-300 flex-grow flex flex-col",
        isPreviewCollapsed ? "w-full" : "w-1/2 border-r"
      )}>

        <div className="nodrag gap-y-4 flex-grow flex flex-col">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Publish As</label>
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand._id} value={brand._id}>{brand.name}</SelectItem>
                ))}
                {brands.length === 0 && (
                  <SelectItem value="none" disabled>No brands found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-around gap-2 flex-wrap">
            {socialChannels.map(({ id, icon: Icon, name }) => {
              const isConnected = connectedChannels.includes(id);
              const isSelected = selectedChannels.includes(id);

              return (
                <Button
                  key={id}
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="icon"
                  className={cn(
                    "rounded-full size-10 relative",
                    !isConnected && "opacity-50 border-dashed"
                  )}
                  onClick={() => toggleChannel(id)}
                  title={isConnected ? name : `${name} (Not Connected)`}
                >
                  <Icon className="size-5" />
                  {!isConnected && (
                    <div className="absolute -top-1 -right-1 size-3 bg-destructive rounded-full border border-background" />
                  )}
                </Button>
              );
            })}
          </div>

          {(!selectedBrandId || brands.length === 0) ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="size-4" />
              <AlertTitle>No Brand Selected</AlertTitle>
              <AlertDescription>Select or create a brand to continue.</AlertDescription>
            </Alert>
          ) : connectedChannels.length === 0 && (
            <Alert className="py-2 bg-muted/50">
              <AlertCircle className="size-4" />
              <AlertTitle>No Connections</AlertTitle>
              <AlertDescription className="text-xs">
                This brand has no connected accounts.
                <Link href={`/settings?tab=connections&brandId=${selectedBrandId}`} className="block mt-1 font-medium underline text-primary hover:text-primary/80">
                  Connect Accounts
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <div className={cn(
            "w-full border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground bg-muted/50 overflow-hidden relative flex-grow min-h-0",
            !mediaUrl && "p-4"
          )}>
            {mediaUrl ? (
              <>
                {mediaType === 'image' && <Image src={mediaUrl} alt="Media preview" layout="fill" objectFit="contain" />}
                {mediaType === 'video' && <video src={mediaUrl} controls className="w-full h-full object-contain" />}
              </>
            ) : (
              <span className="text-center text-sm">
                Connect &quot;Media&quot; handle<br />to preview image/video
              </span>
            )}
          </div>

          <Textarea
            placeholder="Write your caption here... Or connect 'Text' handle to populate."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className="resize-none"
          />

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline">
              <CalendarPlus className="mr-2 size-4" /> Schedule
            </Button>
            <Button type="button" onClick={handlePublish} className="flex-grow" disabled={selectedChannels.length === 0}>
              Publish Now
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden relative",
        isPreviewCollapsed ? "w-0 p-0" : "w-1/2 p-4"
      )}>
        <h3 className="font-semibold text-center mb-4">Post Preview</h3>
        <ScrollArea className="h-full pr-4 nodrag">
          {selectedChannels.length > 0 ? (
            selectedChannels.map(channelId => {
              const channel = socialChannels.find(c => c.id === channelId);
              return channel ? <SocialPreview key={channelId} channel={channel} caption={caption} mediaUrl={mediaUrl} mediaType={mediaType} userAvatarUrl={userAvatar?.imageUrl} /> : null;
            })
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center p-8">
              <p>Select one or more social channels to see a live preview of your post.</p>
            </div>
          )}
        </ScrollArea>
      </div>

      <NodeHandle
        id="text-input"
        type="target"
        position={Position.Left}
        nodeType="publishNode"
        isConnectable={isConnectable}
        style={{ top: '25%' }}
      />
      <NodeHandle
        id="media-input"
        type="target"
        position={Position.Left}
        nodeType="publishNode"
        isConnectable={isConnectable}
        style={{ top: '75%' }}
      />
    </NodeShell>
  );
};

export default memo(PublishNode);
