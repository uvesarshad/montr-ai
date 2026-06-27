'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReactNode } from 'react';

interface ContactInfoCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function ContactInfoCard({ title, icon, children }: ContactInfoCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

interface InfoRowProps {
  label: string;
  value?: string | ReactNode;
  href?: string;
}

export function InfoRow({ label, value, href }: InfoRowProps) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 text-primary hover:underline truncate"
        >
          {value}
        </a>
      ) : (
        <span className="col-span-2 truncate">{value}</span>
      )}
    </div>
  );
}
