'use client';

import { useState, useEffect, useMemo } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { Button, Card, Chip, Spinner, ConfirmDialog } from "@/components/ui-kit";
import { WhatsAppLogo } from "@/components/social-icons";
import { useToast } from "@/hooks/use-toast";
import { ConnectAccountDialog } from "@/components/whatsapp/connect-account-dialog";

interface WhatsAppAccount {
    _id: string
    name: string
    phoneNumber: string
    displayPhoneNumber: string
    status: string
    qualityRating?: string
    createdAt: string
}

interface Brand {
    _id: string;
    name: string;
    handle: string;
}

interface WhatsAppConnectionsProps {
    viewMode?: 'grid' | 'list';
    searchQuery?: string;
    hideTitle?: boolean;
    selectedBrandId?: string;
    brands?: Brand[];
}

export function WhatsAppConnections({
    viewMode = 'grid',
    searchQuery = '',
    hideTitle = false,
    selectedBrandId: _selectedBrandId = '',
    brands: _brands = []
}: WhatsAppConnectionsProps) {
    const [accounts, setAccounts] = useState<WhatsAppAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [accountToDelete, setAccountToDelete] = useState<WhatsAppAccount | null>(null)
    const { toast } = useToast()

    const fetchAccounts = async () => {
        try {
            const response = await fetch("/api/whatsapp/accounts")
            if (response.ok) {
                const data = await response.json()
                setAccounts(data.accounts || [])
            }
        } catch (error) {
            console.error("Error fetching accounts:", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAccounts()
    }, [])

    const handleDelete = async (accountId: string) => {
        try {
            const response = await fetch(`/api/whatsapp/accounts/${accountId}`, {
                method: "DELETE",
            })

            if (response.ok) {
                toast({
                    title: "Success",
                    description: "Account disconnected successfully",
                })
                fetchAccounts()
            } else {
                throw new Error("Failed to disconnect");
            }
        } catch {
            toast({
                title: "Error",
                description: "An error occurred",
                variant: "destructive",
            })
            throw new Error("disconnect failed");
        }
    }

    const filteredAccounts = useMemo(() => {
        if (!searchQuery) return accounts;
        const q = searchQuery.toLowerCase();
        return accounts.filter(acc =>
            acc.name.toLowerCase().includes(q) ||
            acc.displayPhoneNumber.toLowerCase().includes(q)
        );
    }, [accounts, searchQuery]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size={28} />
            </div>
        );
    }

    if (filteredAccounts.length === 0 && searchQuery && !("whatsapp".includes(searchQuery.toLowerCase()))) {
        return null;
    }

    return (
        <div className="contents">
            {!hideTitle && (
                <div className="col-span-full mb-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium">WhatsApp Accounts</h3>
                        <p className="text-sm text-muted-foreground">
                            Connect and manage your WhatsApp Business Accounts
                        </p>
                    </div>
                </div>
            )}

            {/* Connect New Card */}
            {viewMode === 'list' ? (
                <ConnectAccountDialog
                    onSuccess={fetchAccounts}
                    trigger={
                        <Card lift className="w-full cursor-pointer border-dashed" bodyClassName="flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                                    <Plus className="size-5" />
                                </span>
                                <div className="text-left">
                                    <span className="block text-sm font-semibold">Connect New Account</span>
                                    <p className="text-xs text-muted-foreground">Add another WhatsApp number</p>
                                </div>
                            </div>
                            <Button size="sm" variant="ghost">Connect</Button>
                        </Card>
                    }
                />
            ) : (
                <ConnectAccountDialog
                    onSuccess={fetchAccounts}
                    trigger={
                        <Card lift className="h-full cursor-pointer border-dashed" bodyClassName="flex flex-col p-4">
                            <div className="flex items-start justify-between">
                                <span className="grid size-10 place-items-center rounded-full bg-muted">
                                    <WhatsAppLogo className="size-6 text-[#25D366]" />
                                </span>
                                <Chip tone="gray">Not Connected</Chip>
                            </div>
                            <div className="mt-4 flex-1">
                                <h4 className="mb-1 text-base font-semibold">Connect New Account</h4>
                                <p className="text-[13px] text-muted-foreground">
                                    Add another WhatsApp Business number to your workspace
                                </p>
                            </div>
                            <Button variant="brand" className="mt-4 w-full">
                                <WhatsAppLogo className="size-4" />
                                Connect WhatsApp
                            </Button>
                        </Card>
                    }
                />
            )}

            {filteredAccounts.map((account) => (
                viewMode === 'list' ? (
                    <Card key={account._id} className="border-brand/40 bg-brand-muted/30" bodyClassName="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                            <span className="grid size-9 place-items-center rounded-lg border border-border bg-card shadow-sm">
                                <MessageSquare className="size-5 text-success" />
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{account.name}</span>
                                    <Chip tone="ok" dot>Connected</Chip>
                                </div>
                                <p className="line-clamp-1 text-xs text-muted-foreground">
                                    {account.displayPhoneNumber} • {account.status}
                                </p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-muted" onClick={() => setAccountToDelete(account)}>
                            Disconnect
                        </Button>
                    </Card>
                ) : (
                    <Card key={account._id} lift className="h-full border-brand/40 bg-brand-muted/30" bodyClassName="flex flex-col p-4">
                        <div className="flex items-start justify-between">
                            <span className="grid size-10 place-items-center rounded-full border border-border bg-card">
                                <MessageSquare className="size-6 text-success" />
                            </span>
                            <Chip tone="ok" dot>Connected</Chip>
                        </div>
                        <div className="mt-4 flex-1">
                            <h4 className="mb-1 truncate text-base font-semibold" title={account.name}>{account.name}</h4>
                            <p className="text-[13px] text-muted-foreground">{account.displayPhoneNumber}</p>
                            <div className="mt-4 flex items-center rounded-md border border-border bg-muted/40 p-2 text-sm font-medium text-foreground">
                                <MessageSquare className="mr-2 size-4 text-success" />
                                Status: {account.status}
                                {account.qualityRating && ` • ${account.qualityRating}`}
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" className="mt-4 w-full text-danger hover:bg-danger-muted" onClick={() => setAccountToDelete(account)}>
                            Disconnect
                        </Button>
                    </Card>
                )
            ))}

            <ConfirmDialog
                open={!!accountToDelete}
                onOpenChange={(o) => { if (!o) setAccountToDelete(null); }}
                title="Disconnect this account?"
                description={accountToDelete ? `"${accountToDelete.name}" will be disconnected from your workspace.` : undefined}
                confirmLabel="Disconnect"
                onConfirm={() => { if (accountToDelete) return handleDelete(accountToDelete._id); }}
            />
        </div>
    )
}
