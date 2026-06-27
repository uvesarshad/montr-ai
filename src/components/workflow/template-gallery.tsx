'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, TrendingUp, Star } from 'lucide-react';
import { TemplateCard } from './template-card';
import { TemplatePreview } from './template-preview';
import { TemplateInstaller } from './template-installer';
import { useRouter } from 'next/navigation';

export interface WorkflowTemplate {
  _id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  type: 'crm' | 'whatsapp' | 'marketing_email' | 'custom';
  nodes: unknown[];
  edges: unknown[];
  author?: {
    name: string;
    avatar?: string;
  };
  stats: {
    installs: number;
    rating: number;
    reviews: number;
  };
  featured?: boolean;
  parameters?: Array<{ key: string; label: string; description: string; type: string; required: boolean; defaultValue?: unknown }>;
  useCases?: string[];
  features?: string[];
  requirements?: string[];
  createdAt: string;
  updatedAt: string;
}

export function TemplateGallery() {
  const { push } = useRouter();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, _setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'recent'>('popular');

  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const [installTemplate, setInstallTemplate] = useState<WorkflowTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showInstaller, setShowInstaller] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (sortBy) params.append('sort', sortBy);

      const response = await fetch(`/api/v2/workflow-templates?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handlePreview = (template: WorkflowTemplate) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleInstall = (template: WorkflowTemplate) => {
    setInstallTemplate(template);
    setShowInstaller(true);
  };

  const handleInstallConfirm = async (templateId: string, params: Record<string, unknown>) => {
    const response = await fetch(`/api/v2/workflow-templates/${templateId}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: params }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to install template');
    }

    const data = await response.json();

    // Redirect to the new workflow
    if (data.workflow?._id) {
      push(`/crm/workflows/${data.workflow._id}`);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    if (searchQuery && !template.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !template.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (categoryFilter !== 'all' && template.category !== categoryFilter) {
      return false;
    }
    if (typeFilter !== 'all' && template.type !== typeFilter) {
      return false;
    }
    if (difficultyFilter !== 'all' && template.difficulty !== difficultyFilter) {
      return false;
    }
    return true;
  });

  // Group by category
  const featured = filteredTemplates.filter((t) => t.featured);
  const categories = Array.from(new Set(filteredTemplates.map((t) => t.category)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Workflow Templates</h1>
        <p className="text-gray-600">
          Start with pre-built workflows and customize them to your needs
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 size-4" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="crm">CRM</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="marketing_email">Email</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v: 'popular' | 'rating' | 'recent') => setSortBy(v)}>
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4" />
                Popular
              </div>
            </SelectItem>
            <SelectItem value="rating">
              <div className="flex items-center gap-2">
                <Star className="size-4" />
                Top Rated
              </div>
            </SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Templates</TabsTrigger>
          {featured.length > 0 && (
            <TabsTrigger value="featured">
              <Star className="size-4 mr-2" />
              Featured
            </TabsTrigger>
          )}
          {categories.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading templates...</div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-2">No templates found</div>
              <p className="text-sm text-gray-400">
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template._id}
                  template={template}
                  onPreview={handlePreview}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {featured.length > 0 && (
          <TabsContent value="featured" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((template) => (
                <TemplateCard
                  key={template._id}
                  template={template}
                  onPreview={handlePreview}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          </TabsContent>
        )}

        {categories.map((category) => {
          const categoryTemplates = filteredTemplates.filter(
            (t) => t.category === category
          );
          return (
            <TabsContent key={category} value={category} className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categoryTemplates.map((template) => (
                  <TemplateCard
                    key={template._id}
                    template={template}
                    onPreview={handlePreview}
                    onInstall={handleInstall}
                  />
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Preview Modal */}
      <TemplatePreview
        template={previewTemplate}
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onInstall={(template) => {
          setShowPreview(false);
          handleInstall(template);
        }}
      />

      {/* Installer Modal */}
      <TemplateInstaller
        template={installTemplate}
        open={showInstaller}
        onClose={() => setShowInstaller(false)}
        onInstall={handleInstallConfirm}
      />
    </div>
  );
}
