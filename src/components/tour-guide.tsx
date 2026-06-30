"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useSession } from '@/lib/auth-client';

// First-run product tour. Anchored to the persistent Rail (left nav) — the only
// chrome that's present on every authenticated page — so it never points at a
// missing element. It auto-starts ONCE, only on /dashboard (the natural "home"
// first screen), so it never dims/interrupts the agent goal→strategy hand-off.
const TOUR_STEPS: DriveStep[] = [
    {
        element: "#rail-item-dashboard",
        popover: {
            title: "Your command center",
            description: "The dashboard rolls up activity, stats, and recent work across every module.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-agent",
        popover: {
            title: "Meet your AI agent",
            description: "Give it a goal in plain English. It plans a strategy, drafts the work, and executes across your whole stack — with you approving the big moves.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-canvas",
        popover: {
            title: "Automation",
            description: "Build no-code workflows on a visual canvas that run on autopilot.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-crm",
        popover: {
            title: "CRM",
            description: "Track contacts, companies, and deals in one pipeline.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-inbox",
        popover: {
            title: "Unified inbox",
            description: "Every conversation — email, WhatsApp, social — in one place.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-social",
        popover: {
            title: "Social",
            description: "Plan, schedule, and analyze posts across all your channels.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-item-docs",
        popover: {
            title: "Docs & content",
            description: "Write, collaborate, and keep your knowledge base in one workspace.",
            side: "right",
            align: "center",
        },
    },
    {
        element: "#rail-account",
        popover: {
            title: "Your account",
            description: "Profile, settings, billing, and theme live here. That's the tour — dive in!",
            side: "right",
            align: "start",
        },
    },
];

export function TourGuide() {
    const { status } = useSession();
    const pathname = usePathname();

    useEffect(() => {
        if (status !== "authenticated") return;
        // Only auto-start from the dashboard "home" — never on /agent (would dim the
        // goal→strategy hand-off) or any deep module page.
        if (pathname !== "/dashboard") return;
        if (localStorage.getItem("hasSeenTour")) return;

        // Resilience: only keep steps whose target is actually in the DOM, so the
        // tour can never render a centered popover over a dimmed page pointing at
        // nothing (e.g. after a shell refactor renames/removes an anchor).
        const steps = TOUR_STEPS.filter(
            (step) => typeof step.element === "string" && document.querySelector(step.element),
        );
        if (steps.length < 2) {
            // Not enough of the UI is mounted yet (e.g. mobile, where the Rail is
            // hidden). Don't burn the one-shot flag — try again next dashboard visit.
            return;
        }

        const driverObj = driver({
            showProgress: true,
            allowClose: true,
            popoverClass: "driverjs-theme",
            steps,
            onDestroyStarted: () => {
                driverObj.destroy();
                localStorage.setItem("hasSeenTour", "true");
            },
        });

        driverObj.drive();

        return () => {
            driverObj.destroy();
        };
    }, [status, pathname]);

    return null;
}
