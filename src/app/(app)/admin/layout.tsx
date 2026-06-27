import { requireSuperAdmin } from '@/middleware/auth';
import Link from 'next/link';
import { LayoutTemplate, Settings, Users, ArrowLeft, Workflow, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui-kit';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Auth guard - redirects if not super admin
    await requireSuperAdmin();

    return (
        <div className="flex h-screen bg-muted/10">
            {/* Admin Sidebar */}
            <aside className="w-64 bg-background border-r hidden md:flex flex-col">
                <div className="h-14 flex items-center px-4 border-b">
                    <Link href="/admin" className="flex items-center gap-2 font-bold text-lg">
                        <Settings className="size-5 text-primary" />
                        <span>Admin Console</span>
                    </Link>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <Link href="/admin/templates" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <LayoutTemplate className="size-4" />
                        Templates
                    </Link>
                    <Link href="/admin/canvas-templates" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Workflow className="size-4" />
                        Canvas Templates
                    </Link>
                    <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Users className="size-4" />
                        Users
                    </Link>
                    <Link href="/admin/providers/ai" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Sparkles className="size-4" />
                        AI Providers
                    </Link>
                    <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Settings className="size-4" />
                        System
                    </Link>
                </nav>

                <div className="p-4 border-t">
                    <Button variant="outline" className="w-full" asChild>
                        <Link href="/">
                            <ArrowLeft className="size-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
