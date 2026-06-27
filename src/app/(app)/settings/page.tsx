'use client';

import { useState, useEffect, useReducer, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Avatar as ShadAvatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Button,
  Card,
  Chip,
  Banner,
  Field,
  Input,
  Textarea,
  IconButton,
  SettingRow,
  Skeleton,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { useProfile } from '@/hooks/use-profile';
import { Eye, EyeOff, User, Lock, Bell, CreditCard, Key, Upload, Check, X, Sparkles, HelpCircle, Mail, MessageSquare, FileText, Link as LinkIcon, Paintbrush, Bot, BriefcaseBusiness, Variable } from 'lucide-react';
import { useAppHeader } from '@/components/app-header';
import { getUserAvatar } from '@/lib/avatar-utils';
import { ConnectionsView } from '@/components/settings/connections-view';
import { AIPreferencesView } from '@/components/settings/ai-preferences-view';
import { BrandAIPersonaView } from '@/components/settings/brand-ai-persona-view';
import { BrandMemoryView } from '@/components/settings/brand-memory-view';
import { CrmSettingsView } from '@/components/settings/crm-settings-view';
import { OrgVariablesView } from '@/components/settings/org-variables-view';
import { SocialApprovalPolicyView } from '@/components/settings/social-approval-policy-view';
import { BrainCircuit, Brain, ShieldCheck } from 'lucide-react';
import { TwoFactorAuth } from '@/components/settings/two-factor-auth';
import { useSession } from '@/lib/auth-client';
import { LanguageSwitcher } from '@/components/language-switcher';

const NAV_ITEMS = [
  { value: 'general', label: 'General', icon: User },
  { value: 'personalization', label: 'Personalization', icon: Paintbrush },
  { value: 'security', label: 'Security', icon: Lock },
  { value: 'connections', label: 'Connections', icon: LinkIcon },
  { value: 'crm', label: 'CRM', icon: BriefcaseBusiness },
  { value: 'variables', label: 'Variables', icon: Variable },
  { value: 'ai-preferences', label: 'AI Preferences', icon: BrainCircuit },
  { value: 'ai-persona', label: 'AI Persona', icon: Bot },
  { value: 'brand-memory', label: 'Brand Memory', icon: Brain },
  { value: 'billing', label: 'Billing', icon: CreditCard },
  { value: 'features', label: 'Feature Access', icon: Sparkles },
  { value: 'support', label: 'Support', icon: HelpCircle },
  { value: 'notifications', label: 'Notifications', icon: Bell },
] as const;

const navTriggerClass =
  'justify-start gap-2 px-3 py-1.5 h-8 text-[12.5px] font-medium data-[state=active]:bg-muted data-[state=active]:text-foreground hover:bg-muted/50 rounded-[6px] transition-colors';

type ApiKeysState = {
  openrouter: string;
  openai: string;
  googleai: string;
  deepseek: string;
  anthropic: string;
  xai: string;
  sarvam: string;
  kimi: string;
  zai: string;
  mistral: string;
  cohere: string;
  groq: string;
  perplexity: string;
  together: string;
  fireworks: string;
  jinaai: string;
  apify: string;
};

const EMPTY_API_KEYS: ApiKeysState = {
  openrouter: '',
  openai: '',
  googleai: '',
  deepseek: '',
  anthropic: '',
  xai: '',
  sarvam: '',
  kimi: '',
  zai: '',
  mistral: '',
  cohere: '',
  groq: '',
  perplexity: '',
  together: '',
  fireworks: '',
  jinaai: '',
  apify: '',
};

type ApiKeysAction =
  | { type: 'setField'; field: keyof ApiKeysState; value: string }
  | { type: 'hydrate'; values: ApiKeysState };

function apiKeysReducer(state: ApiKeysState, action: ApiKeysAction): ApiKeysState {
  switch (action.type) {
    case 'setField':
      return { ...state, [action.field]: action.value };
    case 'hydrate':
      return action.values;
    default:
      return state;
  }
}

function SupportTabContent() {
  return (
    <>
      <div>
        <h3 className="text-[13px] font-semibold">Support</h3>
        <p className="text-[12px] text-muted-foreground">Get help and support for your account.</p>
      </div>

      <Card icon={HelpCircle} title="Contact Support" meta="our team is here to help" bodyClassName="px-4 pb-4 space-y-2">
        {[
          { icon: Mail, title: 'Email Support', line: 'support@montrai.com', note: 'Response within 24 hours' },
          { icon: MessageSquare, title: 'Live Chat', line: 'Chat with our support team', note: 'Available Mon-Fri, 9AM-5PM EST' },
          { icon: FileText, title: 'Documentation', line: 'Browse our help center and guides', note: 'Self-service resources' },
        ].map(({ icon: Icon, title, line, note }) => (
          <div key={title} className="flex items-start gap-4 p-3 rounded-xl bg-secondary hover:bg-muted transition-colors cursor-pointer">
            <Icon className="size-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">{title}</p>
              <p className="text-sm text-muted-foreground">{line}</p>
              <p className="text-xs text-muted-foreground mt-1">{note}</p>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Quick Links" bodyClassName="px-4 pb-4 flex flex-col items-start gap-1">
        {['Getting Started Guide', 'API Documentation', 'Video Tutorials', 'Community Forum'].map((link) => (
          <Button key={link} variant="ghost" size="sm" className="px-0 h-auto py-1 text-brand-strong">
            {link}
          </Button>
        ))}
      </Card>
    </>
  );
}

function NotificationsTabContent() {
  return (
    <>
      <div>
        <h3 className="text-[13px] font-semibold">Notifications</h3>
        <p className="text-[12px] text-muted-foreground">Choose what you want to be notified about.</p>
      </div>
      <Card icon={Bell} title="Email Notifications" meta="select intended email alerts" bodyClassName="px-4 pb-4 divide-y divide-border/60">
        <SettingRow
          label="Marketing emails"
          description="Receive emails about new products, features, and more."
        >
          <Switch id="marketing" />
        </SettingRow>
        <SettingRow
          label="Social updates"
          description="Receive emails about new social interactions."
        >
          <Switch id="social" defaultChecked />
        </SettingRow>
        <SettingRow
          label="Security emails"
          description="Receive emails about your account security."
        >
          <Switch id="security" defaultChecked disabled />
        </SettingRow>
      </Card>
    </>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { replace, refresh: routerRefresh } = useRouter();
  const defaultTab = searchParams.get('tab') || 'general';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const { update: updateSession } = useSession();
  const { data: userProfile, isLoading: isProfileLoading, updateProfile, refresh } = useProfile();

  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Profile state
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [bio, setBio] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [billingAddress, setBillingAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });
  const [profileImage, setProfileImage] = useState('');

  // State for API Keys tab
  const [apiKeys, dispatchApiKeys] = useReducer(apiKeysReducer, EMPTY_API_KEYS);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.name || (user?.displayName as string | undefined) || '');
      setFirstName((userProfile.firstName as string | undefined) || '');
      setLastName((userProfile.lastName as string | undefined) || '');
      setCompany((userProfile.organizationName as string | undefined) || (userProfile.company as string | undefined) || '');
      setBio((userProfile.bio as string | undefined) || '');
      setPhoneNumber((userProfile.phoneNumber as string | undefined) || '');
      const addr = (userProfile.billingAddress as Record<string, string> | undefined) || {};
      setBillingAddress({
        street: addr.street || '',
        city: addr.city || '',
        state: addr.state || '',
        zip: addr.zip || '',
        country: addr.country || '',
      });
      setProfileImage((userProfile.image as string | undefined) || '');
    }
  }, [userProfile, user]);

  useEffect(() => {
    if (userProfile?.userApiKeys) {
      const keys = userProfile.userApiKeys as Record<string, string | undefined>;
      dispatchApiKeys({
        type: 'hydrate',
        values: {
          openrouter: keys.openrouter || '',
          openai: keys.openai || '',
          googleai: keys.google || keys.googleai || '',
          deepseek: keys.deepseek || '',
          anthropic: keys.anthropic || '',
          xai: keys.xai || '',
          sarvam: keys.sarvam || '',
          kimi: keys.kimi || keys.moonshot || '',
          zai: keys.zai || keys.zhipu || '',
          mistral: keys.mistral || '',
          cohere: keys.cohere || '',
          groq: keys.groq || '',
          perplexity: keys.perplexity || '',
          together: keys.together || '',
          fireworks: keys.fireworks || '',
          jinaai: keys.jinaai || '',
          apify: keys.apify || '',
        },
      });
    }
  }, [userProfile]);

  const { setHeaderInfo } = useAppHeader();

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Settings'
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', value);
    replace(`/settings?${nextParams.toString()}`);
  };

  const handleProfileSave = async () => {
    setIsSaving(true);
    try {
      const updatedData = {
        name: displayName,
        firstName,
        lastName,
        company,
        bio,
        billingAddress,
      };
      await updateProfile(updatedData);
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please select an image smaller than 5MB.',
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v2/users/upload-profile-picture', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setProfileImage(data.imageUrl);
      await refresh();

      toast({
        title: 'Profile Picture Updated',
        description: 'Your profile picture has been updated successfully.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: 'Failed to upload profile picture. Please try again.',
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleApiKeysSave = async () => {
    setIsSaving(true);
    try {
      const updatedData = {
        userApiKeys: {
          openrouter: apiKeys.openrouter,
          openai: apiKeys.openai,
          google: apiKeys.googleai,
          deepseek: apiKeys.deepseek,
          anthropic: apiKeys.anthropic,
          xai: apiKeys.xai,
          sarvam: apiKeys.sarvam,
          kimi: apiKeys.kimi,
          zai: apiKeys.zai,
          mistral: apiKeys.mistral,
          cohere: apiKeys.cohere,
          groq: apiKeys.groq,
          perplexity: apiKeys.perplexity,
          together: apiKeys.together,
          fireworks: apiKeys.fireworks,
          jinaai: apiKeys.jinaai,
          apify: apiKeys.apify,
        },
      };
      await updateProfile(updatedData);
      toast({
        title: 'API Keys Saved',
        description: 'Your API keys have been updated securely.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save API keys.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all password fields.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'New password and confirm password must match.',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'New password must be at least 6 characters.',
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      toast({
        title: 'Password Updated',
        description: 'Your password has been updated successfully.',
      });

      // Clear fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update password.',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <Skeleton className="h-full w-full lg:w-1/5" />
          <Skeleton className="flex-1 h-[500px]" />
        </div>
      </div>
    );
  }

  const avatarUrl = profileImage || getUserAvatar(user?.id || '', user?.photoURL);

  // Org admins (with an org) manage org-wide settings like post approvals.
  const userRole = userProfile?.role as string | undefined;
  const isOrgAdmin = Boolean(
    (userRole === 'admin' || userRole === 'super_admin')
  );

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col lg:flex-row gap-3">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col lg:flex-row gap-3">

          <aside className="lg:w-1/5">
            <TabsList className="flex flex-col h-auto items-stretch bg-transparent p-0 gap-0.5 w-full">
              {NAV_ITEMS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className={navTriggerClass}>
                  <Icon className="size-3.5" /> {label}
                </TabsTrigger>
              ))}
              {userProfile?.canUseOwnApiKeys && (
                <TabsTrigger value="apiKeys" className={navTriggerClass}>
                  <Key className="size-3.5" /> API Keys
                </TabsTrigger>
              )}
              {isOrgAdmin && (
                <TabsTrigger value="post-approvals" className={navTriggerClass}>
                  <ShieldCheck className="size-3.5" /> Post Approvals
                </TabsTrigger>
              )}
            </TabsList>
          </aside>
          <div className="flex-1">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold">Profile</h3>
                <p className="text-[12px] text-muted-foreground">This is how others will see you on the site.</p>
              </div>
              <Card
                bodyClassName="p-6 space-y-6"
                footer={
                  <div className="flex w-full justify-end">
                    <Button variant="primary" onClick={handleProfileSave} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                }
              >
                <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                  <div className="relative">
                    <ShadAvatar className="size-20">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback>{displayName?.charAt(0) || 'U'}</AvatarFallback>
                    </ShadAvatar>
                    <IconButton
                      icon={Upload}
                      iconSize={16}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      aria-label="Upload profile picture"
                      className="absolute -bottom-2 -right-2 size-8 rounded-full border border-input bg-card shadow-md"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Upload profile picture"
                      onChange={handleImageUpload}
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <Field label="Display Name" htmlFor="displayName" hint="This is your public display name.">
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your display name"
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="First Name" htmlFor="firstName">
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                    />
                  </Field>
                  <Field label="Last Name" htmlFor="lastName">
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </Field>
                </div>

                <Field label="Email" htmlFor="email" hint="Email addresses are managed via your login provider.">
                  <Input id="email" value={user?.email || ''} disabled />
                </Field>

                <Field label="Phone Number" htmlFor="phoneNumber" hint="Phone number is managed via your login provider.">
                  <Input
                    id="phoneNumber"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </Field>

                <Field label="Company" htmlFor="company">
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                  />
                </Field>

                <Field label="Bio" htmlFor="bio">
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself"
                    rows={3}
                  />
                </Field>

                <div className="border-t border-border pt-6 space-y-4">
                  <h4 className="text-[13px] font-semibold">Billing Address</h4>
                  <Field label="Street Address" htmlFor="street">
                    <Input
                      id="street"
                      value={billingAddress.street}
                      onChange={(e) => setBillingAddress({ ...billingAddress, street: e.target.value })}
                      placeholder="123 Main St"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="City" htmlFor="city">
                      <Input
                        id="city"
                        value={billingAddress.city}
                        onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                        placeholder="New York"
                      />
                    </Field>
                    <Field label="State/Province" htmlFor="state">
                      <Input
                        id="state"
                        value={billingAddress.state}
                        onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                        placeholder="NY"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="ZIP/Postal Code" htmlFor="zip">
                      <Input
                        id="zip"
                        value={billingAddress.zip}
                        onChange={(e) => setBillingAddress({ ...billingAddress, zip: e.target.value })}
                        placeholder="10001"
                      />
                    </Field>
                    <Field label="Country" htmlFor="country">
                      <Input
                        id="country"
                        value={billingAddress.country}
                        onChange={(e) => setBillingAddress({ ...billingAddress, country: e.target.value })}
                        placeholder="United States"
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Personalization Tab */}
            <TabsContent value="personalization" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold">Personalization</h3>
                <p className="text-[12px] text-muted-foreground">Customize your interface and display preferences.</p>
              </div>
              <Card icon={Paintbrush} title="Language" bodyClassName="px-4 pb-4">
                <SettingRow label="Display Language" description="Select your preferred language for the application interface.">
                  <LanguageSwitcher variant="outline" showLabel={true} />
                </SettingRow>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold">Security</h3>
                <p className="text-[12px] text-muted-foreground">Manage your account security settings.</p>
              </div>
              <Card
                icon={Lock}
                title="Password"
                bodyClassName="px-4 pb-4 space-y-4"
                footer={
                  <div className="flex w-full justify-end">
                    <Button
                      variant="outline"
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
                    >
                      {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                    </Button>
                  </div>
                }
              >
                <p className="text-[12.5px] text-muted-foreground">Change your password securely.</p>
                <Field label="Current Password" htmlFor="current">
                  <Input
                    id="current"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    trailingIcon={showCurrentPassword ? EyeOff : Eye}
                    onTrailingClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    trailingAriaLabel={showCurrentPassword ? 'Hide password' : 'Show password'}
                  />
                </Field>
                <Field label="New Password" htmlFor="new">
                  <Input
                    id="new"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    trailingIcon={showNewPassword ? EyeOff : Eye}
                    onTrailingClick={() => setShowNewPassword(!showNewPassword)}
                    trailingAriaLabel={showNewPassword ? 'Hide password' : 'Show password'}
                  />
                </Field>
                <Field label="Confirm New Password" htmlFor="confirm">
                  <Input
                    id="confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    trailingIcon={showConfirmPassword ? EyeOff : Eye}
                    onTrailingClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    trailingAriaLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                  />
                </Field>
              </Card>
              <TwoFactorAuth
                isEnabled={user?.twoFactorEnabled || false}
                onStatusChange={async () => {
                  await updateSession();
                  routerRefresh();
                }}
              />
            </TabsContent>

            {/* Connections Tab */}
            <TabsContent value="connections" className="space-y-3 mt-0">
              <ConnectionsView />
            </TabsContent>

            {/* API Keys Tab */}
            {userProfile?.canUseOwnApiKeys && (
              <TabsContent value="apiKeys" className="space-y-3 mt-0">
                <div>
                  <h3 className="text-[13px] font-semibold">API Keys</h3>
                  <p className="text-[12px] text-muted-foreground">Manage your personal API keys for AI services.</p>
                </div>
                <Card
                  icon={Key}
                  title="Keys Configuration"
                  meta="stored securely encrypted"
                  action={
                    <IconButton
                      icon={showKeys ? EyeOff : Eye}
                      onClick={() => setShowKeys(!showKeys)}
                      aria-label={showKeys ? 'Hide keys' : 'Show keys'}
                    />
                  }
                  bodyClassName="px-4 pb-4 space-y-6"
                  footer={
                    <div className="flex w-full justify-end">
                      <Button variant="primary" onClick={handleApiKeysSave} disabled={isSaving || isProfileLoading}>
                        {isSaving ? 'Saving...' : 'Save API Keys'}
                      </Button>
                    </div>
                  }
                >
                  {/* AI Model Providers Section */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI Model Providers</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="OpenAI (GPT, DALL-E)" htmlFor="openai-key">
                        <Input id="openai-key" type={showKeys ? 'text' : 'password'} placeholder="sk-..." value={apiKeys.openai} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'openai', value: e.target.value })} />
                      </Field>
                      <Field label="Anthropic (Claude)" htmlFor="anthropic-key">
                        <Input id="anthropic-key" type={showKeys ? 'text' : 'password'} placeholder="sk-ant-..." value={apiKeys.anthropic} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'anthropic', value: e.target.value })} />
                      </Field>
                      <Field label="Google AI (Gemini, Imagen, Veo)" htmlFor="googleai-key">
                        <Input id="googleai-key" type={showKeys ? 'text' : 'password'} placeholder="AIza..." value={apiKeys.googleai} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'googleai', value: e.target.value })} />
                      </Field>
                      <Field label="xAI (Grok)" htmlFor="xai-key">
                        <Input id="xai-key" type={showKeys ? 'text' : 'password'} placeholder="xai-..." value={apiKeys.xai} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'xai', value: e.target.value })} />
                      </Field>
                      <Field label="DeepSeek" htmlFor="deepseek-key">
                        <Input id="deepseek-key" type={showKeys ? 'text' : 'password'} placeholder="sk-..." value={apiKeys.deepseek} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'deepseek', value: e.target.value })} />
                      </Field>
                      <Field label="Sarvam (Indian languages)" htmlFor="sarvam-key">
                        <Input id="sarvam-key" type={showKeys ? 'text' : 'password'} placeholder="..." value={apiKeys.sarvam} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'sarvam', value: e.target.value })} />
                      </Field>
                      <Field label="Kimi (Moonshot AI)" htmlFor="kimi-key">
                        <Input id="kimi-key" type={showKeys ? 'text' : 'password'} placeholder="sk-..." value={apiKeys.kimi} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'kimi', value: e.target.value })} />
                      </Field>
                      <Field label="Z.ai (Zhipu GLM)" htmlFor="zai-key">
                        <Input id="zai-key" type={showKeys ? 'text' : 'password'} placeholder="..." value={apiKeys.zai} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'zai', value: e.target.value })} />
                      </Field>
                      <Field label="Mistral AI" htmlFor="mistral-key">
                        <Input id="mistral-key" type={showKeys ? 'text' : 'password'} placeholder="..." value={apiKeys.mistral} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'mistral', value: e.target.value })} />
                      </Field>
                      <Field label="Together AI" htmlFor="together-key">
                        <Input id="together-key" type={showKeys ? 'text' : 'password'} placeholder="..." value={apiKeys.together} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'together', value: e.target.value })} />
                      </Field>
                      <Field label="Fireworks AI" htmlFor="fireworks-key">
                        <Input id="fireworks-key" type={showKeys ? 'text' : 'password'} placeholder="fw_..." value={apiKeys.fireworks} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'fireworks', value: e.target.value })} />
                      </Field>
                      <Field label="Cohere" htmlFor="cohere-key">
                        <Input id="cohere-key" type={showKeys ? 'text' : 'password'} placeholder="..." value={apiKeys.cohere} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'cohere', value: e.target.value })} />
                      </Field>
                      <Field label="Groq (Fast Inference)" htmlFor="groq-key">
                        <Input id="groq-key" type={showKeys ? 'text' : 'password'} placeholder="gsk_..." value={apiKeys.groq} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'groq', value: e.target.value })} />
                      </Field>
                      <Field label="Perplexity (Search)" htmlFor="perplexity-key">
                        <Input id="perplexity-key" type={showKeys ? 'text' : 'password'} placeholder="pplx-..." value={apiKeys.perplexity} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'perplexity', value: e.target.value })} />
                      </Field>
                      <Field label="OpenRouter (Custom Models)" htmlFor="openrouter-key">
                        <Input id="openrouter-key" type={showKeys ? 'text' : 'password'} placeholder="sk-or-..." value={apiKeys.openrouter} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'openrouter', value: e.target.value })} />
                      </Field>
                    </div>
                  </div>

                  {/* Scraping Services Section */}
                  <div className="space-y-4 border-t border-border pt-6">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Web Scraping Services</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Jina AI (Reader)" htmlFor="jinaai-key">
                        <Input id="jinaai-key" type={showKeys ? 'text' : 'password'} placeholder="jina_..." value={apiKeys.jinaai} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'jinaai', value: e.target.value })} />
                      </Field>
                      <Field label="Apify (Scraper)" htmlFor="apify-key">
                        <Input id="apify-key" type={showKeys ? 'text' : 'password'} placeholder="apify_api_..." value={apiKeys.apify} onChange={(e) => dispatchApiKeys({ type: 'setField', field: 'apify', value: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            )}

            {/* AI Preferences Tab */}
            <TabsContent value="ai-preferences" className="space-y-3 mt-0">
              <AIPreferencesView />
            </TabsContent>

            {/* AI Persona Tab */}
            <TabsContent value="ai-persona" className="space-y-3 mt-0">
              <BrandAIPersonaView />
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold">Billing</h3>
                <p className="text-[12px] text-muted-foreground">Manage your subscription and payment method.</p>
              </div>
              <Card
                icon={CreditCard}
                title="Plan Summary"
                action={
                  userProfile?.subscriptionStatus ? (
                    <Chip tone={(userProfile.subscriptionStatus as string) === 'active' ? 'ok' : 'gray'}>
                      {userProfile.subscriptionStatus as string}
                    </Chip>
                  ) : undefined
                }
                bodyClassName="px-4 pb-4 space-y-4"
                footer={
                  <div className="flex w-full items-center justify-between gap-2">
                    <p className="text-[12.5px] text-muted-foreground">
                      {userProfile?.currentPeriodEnd
                        ? ((userProfile.cancelAtPeriodEnd as boolean | undefined)
                          ? `Access ends: ${new Date(userProfile.currentPeriodEnd as string | number | Date).toLocaleDateString()}`
                          : `Next billing date: ${new Date(userProfile.currentPeriodEnd as string | number | Date).toLocaleDateString()}`)
                        : 'No active recurring subscription'}
                    </p>
                    {userProfile?.razorpaySubscriptionId && (userProfile.subscriptionStatus as string) === 'active' && !userProfile.cancelAtPeriodEnd && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-muted"
                        onClick={async () => {
                          if (confirm('Are you sure you want to cancel your subscription? You will still have access until the end of your billing cycle.')) {
                            try {
                              const res = await fetch('/api/v2/razorpay/subscription/cancel', {
                                method: 'POST',
                              });
                              if (!res.ok) throw new Error('Failed to cancel subscription');
                              toast({
                                title: 'Subscription Canceled',
                                description: 'Your subscription will not renew at the end of the billing cycle.',
                              });
                              refresh();
                            } catch (err: unknown) {
                              toast({
                                variant: 'destructive',
                                title: 'Error',
                                description: err instanceof Error ? err.message : 'Unknown error',
                              });
                            }
                          }
                        }}
                      >
                        Cancel Subscription
                      </Button>
                    )}
                  </div>
                }
              >
                <p className="text-[12.5px] text-muted-foreground">
                  You are currently on the {userProfile?.planId ? 'Paid' : 'Free'} Plan.
                </p>
                <div className="flex justify-between items-center bg-muted/40 p-4 rounded-md border border-border">
                  <div>
                    <p className="font-medium">{userProfile?.planId ? 'Paid' : 'Free'} Plan</p>
                    {userProfile?.razorpaySubscriptionId && (
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        Sub ID: {userProfile.razorpaySubscriptionId as string}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/pricing">Upgrade Plan</a>
                  </Button>
                </div>

                {userProfile?.cancelAtPeriodEnd && (
                  <Banner tone="warn">
                    Your subscription will be canceled at the end of your billing cycle. You can continue to use your plan features until then.
                  </Banner>
                )}
              </Card>
            </TabsContent>

            {/* Feature Access Tab */}
            <TabsContent value="features" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold">Feature Access</h3>
                <p className="text-[12px] text-muted-foreground">View and manage your feature access.</p>
              </div>
              <Card icon={Sparkles} title="Available Features" meta="included in your current plan" bodyClassName="px-4 pb-4 divide-y divide-border/60">
                {[
                  { name: 'AI Canvas', description: 'Create and edit visual content with AI', hasAccess: true },
                  { name: 'Document Editor', description: 'Collaborative document editing', hasAccess: true },
                  { name: 'Social Publishing', description: 'Publish to multiple social platforms', hasAccess: true },
                  { name: 'Advanced AI Models', description: 'Access to GPT-4, Claude 3, and more', hasAccess: userProfile?.canUseOwnApiKeys || false },
                  { name: 'Custom API Keys', description: 'Use your own API keys', hasAccess: userProfile?.canUseOwnApiKeys || false },
                  { name: 'Team Collaboration', description: 'Invite team members and collaborate', hasAccess: false },
                  { name: 'Priority Support', description: '24/7 priority customer support', hasAccess: false },
                  { name: 'White Label', description: 'Remove MontrAI branding', hasAccess: false },
                ].map((feature) => (
                  <SettingRow
                    key={feature.name}
                    icon={feature.hasAccess ? Check : X}
                    label={feature.name}
                    description={feature.description}
                  >
                    {feature.hasAccess ? (
                      <Chip tone="ok">Active</Chip>
                    ) : (
                      <Button variant="outline" size="sm">Get Access</Button>
                    )}
                  </SettingRow>
                ))}
              </Card>
            </TabsContent>

            {/* Support Tab */}
            <TabsContent value="support" className="space-y-3 mt-0">
              <SupportTabContent />
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-3 mt-0">
              <NotificationsTabContent />
            </TabsContent>

            {/* Brand Memory Tab */}
            <TabsContent value="brand-memory" className="space-y-3 mt-0">
              <div>
                <h3 className="text-[13px] font-semibold flex items-center gap-2">
                  <Brain className="size-4" /> Brand Memory
                </h3>
                <p className="text-sm text-muted-foreground">Manage the knowledge base your AI Agent uses.</p>
              </div>
              <BrandMemoryView />
            </TabsContent>

            <TabsContent value="crm" className="space-y-3 mt-0">
              <CrmSettingsView />
            </TabsContent>

            <TabsContent value="variables" className="space-y-3 mt-0">
              <OrgVariablesView />
            </TabsContent>

            {isOrgAdmin && (
              <TabsContent value="post-approvals" className="space-y-3 mt-0">
                <SocialApprovalPolicyView />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-10"><Skeleton className="size-6 rounded-full" /></div>}>
      <SettingsContent />
    </Suspense>
  )
}
