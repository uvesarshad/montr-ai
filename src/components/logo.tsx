import { Box } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, showText = false, textClassName, iconClassName }: {
  className?: string,
  showText?: boolean,
  textClassName?: string,
  iconClassName?: string
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Box className={cn("size-7 text-primary", iconClassName)} />
      {showText && (
        <div className="flex items-center gap-1.5">
          <span className={cn("font-bold text-xl tracking-tight", textClassName)}>Montr AI</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase leading-none border border-primary/20">
            Beta
          </span>
        </div>
      )}
    </div>
  );
}
