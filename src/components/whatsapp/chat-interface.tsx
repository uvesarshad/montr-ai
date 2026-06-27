"use client"

import React, { useEffect, useRef, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Check, CheckCheck, Paperclip, Loader2, MoreVertical, Phone, Video, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AISuggestButton } from "./ai-suggest-button"
import { useToast } from "@/hooks/use-toast"
import { MediaPreview } from "./messages/media-preview"

import { Avatar, IconButton, Input, ChatBubble } from "@/components/ui-kit"

interface Message {
    _id: string
    bodyPlain: string
    createdAt: string
    messageMetadata?: {
        direction: 'inbound' | 'outbound'
        status?: string
        mediaUrls?: string[]
        mediaType?: 'image' | 'video' | 'audio' | 'document'
    }
}

interface ChatInterfaceProps {
    messages: Message[]
    contactId: string
    contactName: string
    onSendMessage: (message: string) => Promise<void>
    sending?: boolean
}

export function ChatInterface({ messages, contactId, contactName, onSendMessage, sending }: ChatInterfaceProps) {
    const [messageText, setMessageText] = useState("")
    const [uploading, setUploading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()

    const handleSend = async () => {
        if (!messageText.trim() || sending) return
        await onSendMessage(messageText)
        setMessageText("")
    }

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        if (!validTypes.includes(file.type)) {
            toast({
                title: 'Invalid File Type',
                description: 'Please upload an image, video, or document',
                variant: 'destructive',
            })
            return
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: 'File Too Large',
                description: 'Maximum file size is 10MB',
                variant: 'destructive',
            })
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('accountId', contactId) // Using contactId as placeholder

            const response = await fetch('/api/whatsapp/media/upload', {
                method: 'POST',
                body: formData,
            })

            const data = await response.json()

            if (response.ok) {
                // TODO: Send media message with mediaId
                toast({
                    title: 'Upload Successful',
                    description: `${file.name} uploaded successfully`,
                })
                // Reset file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                }
            } else {
                toast({
                    title: 'Upload Failed',
                    description: data.error || 'Failed to upload file',
                    variant: 'destructive',
                })
            }
        } catch (_error) {
            toast({
                title: 'Error',
                description: 'Failed to upload file',
                variant: 'destructive',
            })
        } finally {
            setUploading(false)
        }
    }

    const getStatusIcon = (status?: string) => {
        if (!status) return null

        switch (status) {
            case 'sent':
                return <Check className="size-3" />
            case 'delivered':
                return <CheckCheck className="size-3" />
            case 'read':
                return <CheckCheck className="size-3 text-info" />
            default:
                return null
        }
    }

    const [isSearching, setIsSearching] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Filter messages based on search query
    const filteredMessages = messages.filter(msg => {
        if (!searchQuery) return true;
        return msg.bodyPlain.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="flex h-full flex-col bg-[#e7ddd3] dark:bg-[#0b141a]">
            {/* Header */}
            <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <Avatar name={contactName} size={40} />
                    <div className="min-w-0 flex-1">
                        {isSearching ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                <Input
                                    icon={Search}
                                    autoFocus
                                    placeholder="Search messages…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    wrapClassName="w-64"
                                />
                                <IconButton
                                    icon={X}
                                    iconSize={16}
                                    aria-label="Close search"
                                    onClick={() => {
                                        setIsSearching(false);
                                        setSearchQuery("");
                                    }}
                                />
                            </div>
                        ) : (
                            <div>
                                <h3 className="text-sm font-semibold leading-none">{contactName}</h3>
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                    <span className="inline-block size-2 animate-pulse rounded-full bg-success" />
                                    WhatsApp
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {!isSearching && (
                        <IconButton icon={Search} aria-label="Search messages" onClick={() => setIsSearching(true)} />
                    )}
                    <IconButton icon={Phone} aria-label="Call" />
                    <IconButton icon={Video} aria-label="Video call" />
                    <span className="mx-1 h-6 w-px bg-border" />
                    <IconButton icon={MoreVertical} aria-label="More" />
                </div>
            </div>

            {/* Messages */}
            <ScrollArea
                className="flex-1 p-4"
                ref={scrollRef}
                style={{
                    backgroundImage: 'radial-gradient(rgba(120,120,90,0.12) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
            >
                <div className="mx-auto flex max-w-4xl flex-col gap-2 pb-4">
                    {filteredMessages.length === 0 && searchQuery ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Search className="mb-2 size-8 opacity-20" />
                            <p>No messages found matching &quot;{searchQuery}&quot;</p>
                        </div>
                    ) : (
                        filteredMessages.map((message) => {
                            const isOutbound = message.messageMetadata?.direction === 'outbound'
                            const time = new Date(message.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })

                            return (
                                <ChatBubble
                                    key={message._id}
                                    dir={isOutbound ? 'out' : 'in'}
                                    variant="whatsapp"
                                    time={
                                        <span className="flex items-center gap-1">
                                            {time}
                                            {isOutbound ? getStatusIcon(message.messageMetadata?.status) : null}
                                        </span>
                                    }
                                >
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.bodyPlain}</p>

                                    {/* Media Display */}
                                    {message.messageMetadata?.mediaUrls && message.messageMetadata.mediaUrls.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            <div className={cn(
                                                "grid gap-2",
                                                message.messageMetadata.mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"
                                            )}>
                                                {message.messageMetadata.mediaUrls.map((url) => (
                                                    <div key={url} className="max-w-xs">
                                                        <MediaPreview
                                                            type={message.messageMetadata?.mediaType || 'document'}
                                                            url={url}
                                                            filename={url.split('/').pop()?.split('?')[0] || 'Media'}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </ChatBubble>
                            )
                        }))}
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-border bg-card p-4">
                <div className="mx-auto flex max-w-4xl flex-col gap-3">
                    <AISuggestButton
                        contactId={contactId}
                        currentMessage={messageText}
                        onSelectSuggestion={(suggestion) => setMessageText(suggestion)}
                    />

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,.pdf,.doc,.docx"
                        onChange={handleFileUpload}
                        aria-label="Upload file"
                        className="hidden"
                    />

                    {/* Controlled composer: AISuggestButton needs to inject text into
                        messageText, which the kit MessageComposer (uncontrolled) can't
                        accept — so this mirrors its styling with controlled state. */}
                    <div className="flex items-end gap-2 rounded-xl border border-input bg-card p-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40">
                        <IconButton
                            icon={uploading ? Loader2 : Paperclip}
                            aria-label="Attach file"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || sending}
                            className={cn('size-8 shrink-0', uploading && '[&_svg]:animate-spin')}
                        />
                        <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    void handleSend()
                                }
                            }}
                            placeholder="Type a message…"
                            aria-label="Message"
                            disabled={sending}
                            rows={Math.min(6, Math.max(1, messageText.split('\n').length))}
                            className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                        />
                        <button
                            type="button"
                            onClick={() => void handleSend()}
                            disabled={sending || !messageText.trim()}
                            aria-label="Send"
                            className={cn(
                                'grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity',
                                (sending || !messageText.trim()) && 'opacity-40',
                            )}
                        >
                            {sending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Send className="h-[15px] w-[15px]" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
