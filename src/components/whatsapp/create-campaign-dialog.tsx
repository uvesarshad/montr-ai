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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button, Field, Input, Select, Stepper } from "@/components/ui-kit"

interface WhatsAppAccountLike {
    _id: string;
    name?: string;
    phoneNumber?: string;
    [key: string]: unknown;
}

interface WhatsAppTemplateLike {
    _id: string;
    name?: string;
    accountId?: string;
    language?: string;
    status?: string;
    category?: string;
    [key: string]: unknown;
}

interface CreateCampaignDialogProps {
    accounts: WhatsAppAccountLike[]
    templates: WhatsAppTemplateLike[]
    onSuccess?: () => void
    trigger?: React.ReactNode
}

export function CreateCampaignDialog({ accounts, templates, onSuccess, trigger }: CreateCampaignDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const [formData, setFormData] = useState({
        name: "",
        accountId: "",
        templateId: "",
        audienceType: "all" as "all" | "tags" | "segment",
        audienceFilter: {},
        scheduledAt: "",
    })

    const handleNext = () => {
        if (step === 1 && (!formData.name || !formData.accountId)) {
            toast({
                title: "Error",
                description: "Please fill in all required fields",
                variant: "destructive",
            })
            return
        }
        if (step === 2 && !formData.templateId) {
            toast({
                title: "Error",
                description: "Please select a template",
                variant: "destructive",
            })
            return
        }
        setStep(step + 1)
    }

    const handleBack = () => {
        setStep(step - 1)
    }

    const handleSubmit = async () => {
        setLoading(true)

        try {
            const response = await fetch("/api/whatsapp/campaigns", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            })

            if (!response.ok) {
                throw new Error("Failed to create campaign")
            }

            toast({
                title: "Success",
                description: "Campaign created successfully",
            })

            setOpen(false)
            setStep(1)
            setFormData({
                name: "",
                accountId: "",
                templateId: "",
                audienceType: "all",
                audienceFilter: {},
                scheduledAt: "",
            })

            onSuccess?.()
        } catch (_error) {
            toast({
                title: "Error",
                description: "Failed to create campaign",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    const accountTemplates = templates.filter(
        t => t.whatsappAccountId === formData.accountId && t.status === 'APPROVED'
    )

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || <Button variant="brand">Create Campaign</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Create WhatsApp Campaign</DialogTitle>
                    <DialogDescription>
                        {step === 1 && "Choose a name and WhatsApp account"}
                        {step === 2 && "Select a message template"}
                        {step === 3 && "Define your audience"}
                        {step === 4 && "Schedule your campaign"}
                    </DialogDescription>
                </DialogHeader>

                <Stepper
                    steps={["Basics", "Template", "Audience", "Schedule"]}
                    current={step - 1}
                    className="overflow-x-auto py-1"
                />

                <div className="py-4">
                    {/* Step 1: Basic Info */}
                    {step === 1 && (
                        <div className="grid gap-4">
                            <Field label="Campaign Name" required htmlFor="name">
                                <Input
                                    id="name"
                                    placeholder="e.g., Summer Sale 2024"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </Field>
                            <Field label="WhatsApp Account" required>
                                <Select
                                    value={formData.accountId}
                                    onChange={(value) => setFormData({ ...formData, accountId: value, templateId: "" })}
                                    placeholder="Select account"
                                    options={accounts.map((account) => ({
                                        value: account._id,
                                        label: account.name ?? account._id,
                                    }))}
                                />
                            </Field>
                        </div>
                    )}

                    {/* Step 2: Template Selection */}
                    {step === 2 && (
                        <div className="grid gap-4">
                            <Label>Select Template *</Label>
                            <RadioGroup value={formData.templateId} onValueChange={(value) => setFormData({ ...formData, templateId: value })}>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {accountTemplates.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No approved templates found for this account</p>
                                    ) : (
                                        accountTemplates.map((template) => (
                                            <div key={template._id} className="flex items-start gap-x-2 rounded-lg border border-border p-3">
                                                <RadioGroupItem value={template._id} id={template._id} />
                                                <Label htmlFor={template._id} className="flex-1 cursor-pointer">
                                                    <div className="font-medium">{template.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {template.category} • {template.language}
                                                    </div>
                                                </Label>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </RadioGroup>
                        </div>
                    )}

                    {/* Step 3: Audience */}
                    {step === 3 && (
                        <div className="grid gap-4">
                            <Label>Target Audience *</Label>
                            <RadioGroup value={formData.audienceType} onValueChange={(value: string) => setFormData({ ...formData, audienceType: value as 'tags' | 'all' | 'segment' })}>
                                <div className="flex items-center gap-x-2">
                                    <RadioGroupItem value="all" id="all" />
                                    <Label htmlFor="all" className="cursor-pointer">All WhatsApp Contacts</Label>
                                </div>
                                <div className="flex items-center gap-x-2">
                                    <RadioGroupItem value="tags" id="tags" />
                                    <Label htmlFor="tags" className="cursor-pointer">Contacts with specific tags</Label>
                                </div>
                                <div className="flex items-center gap-x-2">
                                    <RadioGroupItem value="segment" id="segment" />
                                    <Label htmlFor="segment" className="cursor-pointer">Custom segment</Label>
                                </div>
                            </RadioGroup>
                            {formData.audienceType !== 'all' && (
                                <p className="text-sm text-muted-foreground">
                                    Advanced filtering will be available after campaign creation
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 4: Schedule */}
                    {step === 4 && (
                        <div className="grid gap-4">
                            <Field
                                label="Schedule (Optional)"
                                htmlFor="schedule"
                                hint="Leave empty to send immediately after creation"
                            >
                                <Input
                                    id="schedule"
                                    type="datetime-local"
                                    value={formData.scheduledAt}
                                    onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                />
                            </Field>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step > 1 && (
                        <Button type="button" variant="outline" icon={ChevronLeft} onClick={handleBack}>
                            Back
                        </Button>
                    )}
                    {step < 4 ? (
                        <Button type="button" variant="brand" iconRight={ChevronRight} onClick={handleNext}>
                            Next
                        </Button>
                    ) : (
                        <Button type="button" variant="brand" onClick={handleSubmit} disabled={loading}>
                            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Create Campaign
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
