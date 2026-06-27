'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Eye, Star } from 'lucide-react';
import { WorkflowTemplate } from './template-gallery';

interface TemplateCardProps {
  template: WorkflowTemplate;
  onPreview: (template: WorkflowTemplate) => void;
  onInstall: (template: WorkflowTemplate) => void;
}

export function TemplateCard({ template, onPreview, onInstall }: TemplateCardProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'advanced':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'crm':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'whatsapp':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'marketing_email':
        return 'bg-indigo-100 text-indigo-700 border-indigo-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={getTypeColor(template.type)}>
              {template.type}
            </Badge>
            <Badge variant="outline" className={getDifficultyColor(template.difficulty)}>
              {template.difficulty}
            </Badge>
            {template.featured && (
              <Badge className="bg-yellow-500">
                <Star className="size-3 mr-1" />
                Featured
              </Badge>
            )}
          </div>
        </div>

        <CardTitle className="text-lg line-clamp-1">{template.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {template.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-3">
          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {template.tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {template.tags?.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{template.tags.length - 3}
              </Badge>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Download className="size-4" />
              <span>{template.stats.installs.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="size-4 text-yellow-500 fill-yellow-500" />
              <span>{template.stats.rating.toFixed(1)}</span>
            </div>
            <div className="text-xs text-gray-500">
              {template.nodes?.length || 0} nodes
            </div>
          </div>

          {/* Author */}
          {template.author && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="size-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium">
                {template.author.name.charAt(0).toUpperCase()}
              </div>
              <span>{template.author.name}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreview(template)}
          className="flex-1"
        >
          <Eye className="size-4 mr-2" />
          Preview
        </Button>
        <Button
          size="sm"
          onClick={() => onInstall(template)}
          className="flex-1"
        >
          <Download className="size-4 mr-2" />
          Install
        </Button>
      </CardFooter>
    </Card>
  );
}
