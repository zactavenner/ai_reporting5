import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, Check, User, Palette, Type, Info, Link, ImagePlus, Sparkles } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAvatars } from '@/hooks/useAvatars';
import type { StaticBatchConfig, Client, Avatar } from '@/types';
import { cn } from '@/lib/utils';

interface ProjectSetupProps {
  config: StaticBatchConfig;
  updateConfig: (updates: Partial<StaticBatchConfig>) => void;
  client?: Client | null;
  projectOfferDescription?: string | null;
  onOfferChange?: (offer: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ProjectSetup({ config, updateConfig, client, projectOfferDescription, onOfferChange, onNext, onBack }: ProjectSetupProps) {
  const { data: avatars = [] } = useAvatars(client?.id);
  
  const [editableOffer, setEditableOffer] = useState(projectOfferDescription || client?.offer_description || '');
  const [editableDescription, setEditableDescription] = useState(config.productDescription || client?.description || '');

  useEffect(() => {
    if (!editableOffer && (projectOfferDescription || client?.offer_description)) {
      setEditableOffer(projectOfferDescription || client?.offer_description || '');
    }
    if (!editableDescription && client?.description) {
      setEditableDescription(client.description);
    }
  }, [projectOfferDescription, client]);

  // Sync editable fields back to config
  useEffect(() => {
    if (editableDescription !== config.productDescription) {
      updateConfig({ productDescription: editableDescription });
    }
  }, [editableDescription, config.productDescription, updateConfig]);

  useEffect(() => {
    onOfferChange?.(editableOffer);
  }, [editableOffer, onOfferChange]);

  // Auto-apply brand assets from client
  const brandColors = client?.brand_colors || [];
  const brandFonts = client?.brand_fonts || [];
  const productUrl = client?.product_url || '';
  const productImages = client?.product_images || [];

  const handleSelectAvatar = (avatar: Avatar) => {
    updateConfig({ characterImageUrl: avatar.image_url });
  };

  const selectedAvatar = avatars.find(a => a.image_url === config.characterImageUrl);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Project Setup</h2>
        <p className="text-sm text-muted-foreground">
          Review client brand assets and select a spokesperson for your ads.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Brand Guide Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              Brand Guide
            </CardTitle>
            <CardDescription>
              Using {client?.name || 'Client'}'s brand settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Brand Colors */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Palette className="h-4 w-4" />
                Brand Colors
              </Label>
              {brandColors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {brandColors.map((color, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/50"
                    >
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-mono">{color}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No brand colors set. Add them in the client's Brand Guide.
                </p>
              )}
            </div>

            {/* Brand Fonts */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Type className="h-4 w-4" />
                Brand Fonts
              </Label>
              {brandFonts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {brandFonts.map((font, index) => (
                    <Badge key={index} variant="secondary">
                      {font}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No brand fonts set. Add them in the client's Brand Guide.
                </p>
              )}
            </div>

            {/* Product URL */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Link className="h-4 w-4" />
                Product URL
              </Label>
              {productUrl ? (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate block"
                >
                  {productUrl}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No product URL set. Add it in the client's Brand Guide.
                </p>
              )}
            </div>

            {/* Product Images */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <ImagePlus className="h-4 w-4" />
                Product Images
              </Label>
              {productImages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {productImages.map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      alt={`Product ${index + 1}`}
                      className="w-16 h-16 rounded-lg object-cover border"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No product images. Add them in the client's Brand Guide.
                </p>
              )}
            </div>

            {/* Offer Description - EDITABLE, feeds into AI prompt */}
            <div>
              <Label className="mb-2 flex items-center gap-2 font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Offer / Value Proposition
                <Badge variant="default" className="text-[10px] ml-1">FEEDS INTO AI PROMPT</Badge>
              </Label>
              <Textarea
                value={editableOffer}
                onChange={(e) => setEditableOffer(e.target.value)}
                placeholder="Describe the specific offer, value proposition, or CTA for this ad campaign..."
                className="min-h-[100px] border-primary/30 bg-primary/5 focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                This text is sent as "Offer/Value Proposition" in the generation prompt.
              </p>
            </div>

            {/* Product Description - EDITABLE, feeds into AI prompt */}
            <div>
              <Label className="mb-2 flex items-center gap-2 font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                Product Context
                <Badge variant="secondary" className="text-[10px] ml-1">FEEDS INTO AI PROMPT</Badge>
              </Label>
              <Textarea
                value={editableDescription}
                onChange={(e) => setEditableDescription(e.target.value)}
                placeholder="Describe the product or service being advertised..."
                className="min-h-[80px]"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                This text is sent as "Product/Service" context in the generation prompt.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Avatar Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Select Spokesperson
            </CardTitle>
            <CardDescription>
              Choose an avatar to feature in your ads (optional)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {avatars.length > 0 ? (
              <RadioGroup
                value={config.characterImageUrl || ''}
                onValueChange={(value) => {
                  const avatar = avatars.find(a => a.image_url === value);
                  if (avatar) handleSelectAvatar(avatar);
                }}
                className="grid grid-cols-3 gap-3"
              >
                {avatars.map((avatar) => (
                  <div key={avatar.id}>
                    <RadioGroupItem
                      value={avatar.image_url}
                      id={avatar.id}
                      className="sr-only"
                    />
                    <Label
                      htmlFor={avatar.id}
                      className={cn(
                        'flex flex-col items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50',
                        config.characterImageUrl === avatar.image_url
                          ? 'border-primary bg-primary/5'
                          : 'border-muted'
                      )}
                    >
                      <div className="relative">
                        <img
                          src={avatar.image_url}
                          alt={avatar.name}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                        {config.characterImageUrl === avatar.image_url && (
                          <div className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                        {avatar.is_stock && (
                          <Badge 
                            variant="secondary" 
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] px-1"
                          >
                            Stock
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-medium text-center truncate w-full">
                        {avatar.name}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No avatars available</p>
                <p className="text-xs mt-1">
                  Create an avatar for this client first
                </p>
              </div>
            )}

            {selectedAvatar && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">{selectedAvatar.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedAvatar.gender && (
                    <Badge variant="outline" className="text-xs">{selectedAvatar.gender}</Badge>
                  )}
                  {selectedAvatar.age_range && (
                    <Badge variant="outline" className="text-xs">{selectedAvatar.age_range}</Badge>
                  )}
                  {selectedAvatar.style && (
                    <Badge variant="outline" className="text-xs">{selectedAvatar.style}</Badge>
                  )}
                </div>
              </div>
            )}

            {config.characterImageUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => updateConfig({ characterImageUrl: '' })}
              >
                Clear selection
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* What feeds into the AI prompt */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
        <p className="font-medium text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          What feeds into the static ad AI prompt:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
          <li><strong>Style prompt</strong> — from the selected ad style's prompt template</li>
          <li><strong>Reference images</strong> — uploaded to each style, AI emulates their look</li>
          <li><strong>Offer / Value Proposition</strong> — the editable field above (highlighted in blue)</li>
          <li><strong>Product Context</strong> — the editable description above</li>
          <li><strong>Brand Colors & Fonts</strong> — injected as color/font instructions (can be strict)</li>
          <li><strong>Spokesperson image</strong> — if selected, used as character reference</li>
          <li><strong>Ad image assets</strong> — uploaded in Config step, sent as visual references</li>
          <li><strong>Disclaimer</strong> — if enabled, rendered at bottom of each ad</li>
          <li><strong>Aspect ratio</strong> — determines image dimensions (9:16 uses IG safe zones)</li>
        </ul>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={onNext} size="lg">
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
