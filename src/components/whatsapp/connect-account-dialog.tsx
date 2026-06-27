"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Button, Field, Input } from "@/components/ui-kit"

interface ConnectAccountDialogProps {
    onSuccess?: () => void
    trigger?: React.ReactNode
}

export function ConnectAccountDialog({ onSuccess, trigger }: ConnectAccountDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const [formData, setFormData] = useState({
        name: "",
        facebookAppId: "",
        wabaId: "",
        phoneNumberId: "",
        accessToken: "",
        phoneNumber: "",
        displayPhoneNumber: "",
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const response = await fetch("/api/whatsapp/accounts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            })

            if (!response.ok) {
                throw new Error("Failed to connect account")
            }

            toast({
                title: "Success",
                description: "WhatsApp account connected successfully",
            })

            setOpen(false)
            setFormData({
                name: "",
                facebookAppId: "",
                wabaId: "",
                phoneNumberId: "",
                accessToken: "",
                phoneNumber: "",
                displayPhoneNumber: "",
            })

            onSuccess?.()
        } catch (_error) {
            toast({
                title: "Error",
                description: "Failed to connect WhatsApp account",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button variant="primary">Connect WhatsApp Account</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Connect WhatsApp Account</DialogTitle>
                        <DialogDescription>
                            Enter your Meta WhatsApp Business API credentials to connect your account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Field label="Account Name" required htmlFor="name">
                            <Input
                                id="name"
                                placeholder="e.g., Sales Team"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </Field>
                        <Field label="Facebook App ID" required htmlFor="facebookAppId">
                            <Input
                                id="facebookAppId"
                                placeholder="Your Facebook App ID"
                                value={formData.facebookAppId}
                                onChange={(e) => setFormData({ ...formData, facebookAppId: e.target.value })}
                            />
                        </Field>
                        <Field label="WhatsApp Business Account ID" required htmlFor="wabaId">
                            <Input
                                id="wabaId"
                                placeholder="Your WABA ID"
                                value={formData.wabaId}
                                onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                            />
                        </Field>
                        <Field label="Phone Number ID" required htmlFor="phoneNumberId">
                            <Input
                                id="phoneNumberId"
                                placeholder="Your Phone Number ID"
                                value={formData.phoneNumberId}
                                onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                            />
                        </Field>
                        <Field label="Phone Number" required htmlFor="phoneNumber">
                            <Input
                                id="phoneNumber"
                                placeholder="+1234567890"
                                value={formData.phoneNumber}
                                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                            />
                        </Field>
                        <Field label="Access Token" required htmlFor="accessToken">
                            <Input
                                id="accessToken"
                                type="password"
                                placeholder="Your Meta Access Token"
                                value={formData.accessToken}
                                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                            />
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Connecting…' : 'Connect Account'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
