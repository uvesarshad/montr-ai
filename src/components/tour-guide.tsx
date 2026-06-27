"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useSession } from '@/lib/auth-client';

export function TourGuide() {
    const { status } = useSession();

    useEffect(() => {
        if (status !== "authenticated") return;

        const hasSeenTour = localStorage.getItem("hasSeenTour");
        if (hasSeenTour) return;

        const driverObj = driver({
            showProgress: true,
            allowClose: true,
            popoverClass: 'driverjs-theme',
            steps: [
                {
                    element: "#sidebar-item-dashboard",
                    popover: {
                        title: "Dashboard",
                        description: "Get an overview of your activities, stats, and recent updates.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-automation",
                    popover: {
                        title: "Automation",
                        description: "Manage your canvases and build automation flows.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-inbox",
                    popover: {
                        title: "Inbox",
                        description: "Centralized inbox for all your communications and chats.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-social",
                    popover: {
                        title: "Social Media",
                        description: "Plan, schedule, and analyze your social media posts.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-crm",
                    popover: {
                        title: "CRM",
                        description: "Manage relationships with your contacts, companies, and deals.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-marketing",
                    popover: {
                        title: "Marketing",
                        description: "Run email campaigns and manage WhatsApp marketing.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-ai-studio",
                    popover: {
                        title: "AI Studio",
                        description: "Generate content using advanced AI tools for text, image, video, and more.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-docs",
                    popover: {
                        title: "Docs",
                        description: "Create and collaborate on documents within the platform.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-forms",
                    popover: {
                        title: "Forms",
                        description: "Build and manage forms to collect data.",
                        side: "right",
                        align: "center",
                    },
                },
                // New Sidebar Steps
                {
                    element: "#create-canvas-btn",
                    popover: {
                        title: "Create Canvas",
                        description: "Quickly create a new whiteboard canvas directly from the sidebar.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#credit-meter",
                    popover: {
                        title: "Credit Meter",
                        description: "Monitor your usage and available credits.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-theme-toggle",
                    popover: {
                        title: "Theme Toggle",
                        description: "Switch between light and dark modes.",
                        side: "right",
                        align: "center",
                    },
                },
                {
                    element: "#sidebar-item-settings",
                    popover: {
                        title: "Settings",
                        description: "Configure your workspace and preferences.",
                        side: "right",
                        align: "center",
                    },
                },
                // Header Steps
                {
                    element: "#header-create-btn",
                    popover: {
                        title: "Quick Create",
                        description: "Create new Canvases, Documents, Posts, or Contacts from anywhere.",
                        side: "bottom",
                        align: "center",
                        onNextClick: () => {
                            // Close the dropdown before moving on
                            const btn = document.querySelector("#header-create-btn") as HTMLElement;
                            if (btn && btn.getAttribute("aria-expanded") === "true") {
                                btn.click();
                            }
                            driverObj.moveNext();
                        }
                    },
                    onHighlightStarted: (element) => {
                        // Automatically open the dropdown when highlighted
                        // Use a slight delay to ensure the UI is ready
                        setTimeout(() => {
                            if (element && (element as HTMLElement).getAttribute("aria-expanded") !== "true") {
                                (element as HTMLElement).click();
                            }
                        }, 300);
                    }
                },
                {
                    element: "#header-search",
                    popover: {
                        title: "Search",
                        description: "Quickly find anything across the platform.",
                        side: "bottom",
                        align: "center",
                    },
                },
                {
                    element: "#user-menu",
                    popover: {
                        title: "Profile & Settings",
                        description: "Access your profile, settings, and billing information.",
                        side: "left",
                        align: "start",
                    },
                },
            ],
            onDestroyStarted: () => {
                driverObj.destroy();
                localStorage.setItem("hasSeenTour", "true");
            },
        });

        driverObj.drive();

        return () => {
            driverObj.destroy();
        }
    }, [status]);

    return null;
}
