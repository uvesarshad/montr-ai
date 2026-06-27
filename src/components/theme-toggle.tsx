'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';


export function ThemeToggle({ className, showLabel = false, isCollapsed = false, id }: { className?: string, showLabel?: boolean, isCollapsed?: boolean, id?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    // Use resolvedTheme to get the actual current theme (handles 'system' correctly)
    const currentTheme = resolvedTheme || theme || 'light';
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  // Don't render anything until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        type="button"
        id={id}
        className={className}
        title="Toggle theme"
        disabled
      >
        <div className="relative h-[1.2rem] w-[1.2rem]">
          <Sun className="h-full w-full" />
        </div>
        <span className="sr-only">Toggle theme</span>
        {showLabel && !isCollapsed && <span>Toggle Theme</span>}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      id={id}
      onClick={toggleTheme}
      className={className}
      title="Toggle theme"
    >
      <div className="relative h-[1.2rem] w-[1.2rem]">
        <Sun className="absolute h-full w-full rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-full w-full rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </div>
      <span className="sr-only">Toggle theme</span>
      {showLabel && !isCollapsed && <span>Toggle Theme</span>}
    </Button>
  );
}
