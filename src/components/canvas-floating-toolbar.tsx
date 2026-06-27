'use client';

import {
  Image,
  Paperclip,
  Type,
  Globe,
  Youtube,
  Instagram,
  Mic,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { LinkedinLogo, XLogo, RedditLogo, PinterestLogo } from './social-icons';

const nodeTypes = [
  { type: 'textInput', name: 'Text', icon: Type },
  { type: 'fileNode', name: 'File', icon: Paperclip },
  { type: 'imageNode', name: 'Image', icon: Image },
  { type: 'pinterestNode', name: 'Pinterest', icon: PinterestLogo },
  { type: 'websiteNode', name: 'Website', icon: Globe },
  { type: 'youtubeNode', name: 'YouTube', icon: Youtube },
  { type: 'instagramNode', name: 'Instagram', icon: Instagram },
  { type: 'linkedinNode', name: 'LinkedIn', icon: LinkedinLogo },
  { type: 'xNode', name: 'X (Twitter)', icon: XLogo },
  { type: 'redditNode', name: 'Reddit', icon: RedditLogo },
  { type: 'audioNode', name: 'Audio', icon: Mic },
];


export function CanvasFloatingToolbar({ onSave: _onSave }: { onSave: () => void }) {
  const onDragStart = (
    event: React.DragEvent<HTMLElement>,
    nodeType: string
  ) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="absolute top-1/2 -translate-y-1/2 left-6 z-10 hidden md:block">
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col items-center gap-2 p-2 border-0 rounded-full bg-background/60 backdrop-blur-xl shadow-xl transition-all hover:bg-background/80">
          {nodeTypes.map(({ type, name, icon: Icon }) => (
            <Tooltip key={`${name}-${type}`}>
              <TooltipTrigger asChild>
                <div
                  className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                  onDragStart={(event) => {
                    // Create a custom drag image or use the default
                    // const img = new Image();
                    // img.src = '...';
                    // event.dataTransfer.setDragImage(img, 10, 10);
                    onDragStart(event, type)
                  }}
                  draggable
                >
                  <Icon className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="ml-2 font-medium">
                <p>{name}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </aside>
  );
}
