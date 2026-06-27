'use client';

import {
  Save,
  Bot,
  Image as ImageIcon,
  Video,
  Terminal,
  Send,
  FileText,
  Loader2,
} from 'lucide-react';
import { Separator } from './ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from './ui/button';

export function CanvasRightToolbar({ onSave, isSaving }: { onSave: () => void; isSaving?: boolean }) {
  const onDragStart = (
    event: React.DragEvent<HTMLElement>,
    nodeType: string
  ) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="absolute top-1/2 -translate-y-1/2 right-6 z-10 hidden md:block">
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col items-center gap-2 p-2 border-0 rounded-full bg-background/60 backdrop-blur-xl shadow-xl transition-all hover:bg-background/80">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSave}
                disabled={isSaving}
                className="rounded-full hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Save className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Save Canvas</TooltipContent>
          </Tooltip>

          <Separator orientation="horizontal" className="w-8 my-1 bg-border/50" />

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'promptNode')}
                draggable
              >
                <Terminal className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Prompt</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'documentNode')}
                draggable
              >
                <FileText className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Document</TooltipContent>
          </Tooltip>

          <Separator orientation="horizontal" className="w-8 my-1 bg-border/50" />

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'aiChatbot')}
                draggable
              >
                <Bot className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">AI Chatbot</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'generateImage')}
                draggable
              >
                <ImageIcon className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Generate Image</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'generateVideo')}
                draggable
              >
                <Video className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Generate Video</TooltipContent>
          </Tooltip>

          <Separator orientation="horizontal" className="w-8 my-1 bg-border/50" />

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="cursor-grab active:cursor-grabbing p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors duration-200 group"
                onDragStart={(event) => onDragStart(event, 'publishNode')}
                draggable
              >
                <Send className="size-5 text-[#222222] dark:text-[#EDEADE] group-hover:text-primary transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="mr-2 font-medium">Publish</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
