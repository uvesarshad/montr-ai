import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';

export function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex w-full">
            {/* Left side: Branding/Visuals */}
            <div className="hidden lg:flex w-1/2 bg-primary flex-col justify-between p-12 relative overflow-hidden text-primary-foreground">

                {/* Abstract background shapes */}
                <div className="absolute -top-32 -left-32 size-96 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>
                <div className="absolute top-1/2 left-1/2 size-64 bg-accent/20 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2"></div>

                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <Image src="/montr_ai_logo_icon.png" alt="Montr AI Logo" width={24} height={24} className="size-6 object-contain" />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xl tracking-tight">Montr AI</span>
                            <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground uppercase leading-none border border-primary-foreground/20">
                                Beta
                            </span>
                        </div>
                    </Link>
                </div>

                <div className="relative z-10 max-w-md space-y-6">
                    <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                        The Most Powerful AI Suite for Marketers
                    </h1>
                    <p className="text-primary-foreground/80 text-lg">
                        Automate your entire marketing stack with one platform. From content creation to lead closing.
                    </p>
                </div>

                <div className="relative z-10 text-sm text-primary-foreground/60">
                    &copy; {new Date().getFullYear()} Montr AI. All rights reserved.
                </div>
            </div>

            {/* Right side: Form Container */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 bg-background relative">
                {/* Theme Toggle Button */}
                <div className="absolute top-4 right-4 z-50">
                    <ThemeToggle />
                </div>

                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Logo Header */}
                    <div className="lg:hidden flex justify-center mb-6">
                        <div className="flex items-center gap-2">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <Image src="/montr_ai_logo_icon.png" alt="Montr AI Logo" width={24} height={24} className="size-6 object-contain" />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xl tracking-tight">Montr AI</span>
                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase leading-none border border-primary/20">
                                    Beta
                                </span>
                            </div>
                        </div>
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
