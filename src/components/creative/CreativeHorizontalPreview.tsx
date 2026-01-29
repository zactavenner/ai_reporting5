import { useState, useRef } from 'react';
import { Creative } from '@/hooks/useCreatives';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { getAspectFitClasses } from '@/lib/aspectRatioUtils';
import { 
  Heart, 
  MessageCircle, 
  Send, 
  Bookmark, 
  MoreHorizontal, 
  ThumbsUp, 
  Share2, 
  Play, 
  Pause,
  Volume2,
  VolumeX,
  X,
  ChevronUp,
  Link2
} from 'lucide-react';

interface CreativeHorizontalPreviewProps {
  creative: Creative;
  clientName: string;
}

export function CreativeHorizontalPreview({ creative, clientName }: CreativeHorizontalPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  const toggleVideo = (platform: string) => {
    const videoRef = videoRefs.current[platform];
    if (videoRef) {
      if (videoRef.paused) {
        // Pause all other videos first
        Object.values(videoRefs.current).forEach(v => {
          if (v && v !== videoRef) v.pause();
        });
        videoRef.play();
        setIsPlaying(true);
      } else {
        videoRef.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    Object.values(videoRefs.current).forEach(v => {
      if (v) v.muted = newMuted;
    });
  };

  const getDomain = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '') + '.com';
  };

  // Render media with aspect ratio awareness
  const renderMedia = (platform: string, containerAspect: string) => {
    const { objectFit, bgClass } = getAspectFitClasses(containerAspect, creative.aspect_ratio);
    
    if (creative.type === 'image' && creative.file_url) {
      return (
        <div className={`relative w-full h-full ${bgClass}`}>
          <img 
            src={creative.file_url} 
            alt={creative.title}
            className={`w-full h-full ${objectFit}`}
          />
        </div>
      );
    }
    
    if (creative.type === 'video' && creative.file_url) {
      return (
        <div 
          className={`relative w-full h-full group cursor-pointer ${bgClass}`}
          onClick={() => toggleVideo(platform)}
        >
          <video 
            ref={(el) => { videoRefs.current[platform] = el; }}
            src={creative.file_url}
            className={`w-full h-full ${objectFit}`}
            loop
            playsInline
            muted={isMuted}
          />
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
            <div className="bg-black/50 rounded-full p-3">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-white fill-white" />
              ) : (
                <Play className="h-6 w-6 text-white fill-white" />
              )}
            </div>
          </div>
        </div>
      );
    }

    // Copy/text creative
    return (
      <div className="w-full h-full flex items-center justify-center p-4 text-center bg-gradient-to-br from-primary/10 to-primary/5">
        <div>
          <p className="text-base font-bold">{creative.headline}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{creative.body_copy}</p>
        </div>
      </div>
    );
  };

  // Facebook Feed Preview
  const FacebookFeed = () => (
    <div className="flex-shrink-0 w-[280px]">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">f</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Facebook Feed</span>
        <MoreHorizontal className="h-4 w-4 ml-auto text-muted-foreground" />
      </div>
      <Card className="overflow-hidden bg-background border">
        {/* Header */}
        <div className="flex items-center gap-2 p-2 border-b">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {clientName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs truncate">{clientName}</p>
            <p className="text-[10px] text-muted-foreground">Sponsored · 🌐</p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <X className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Primary Text */}
        {creative.body_copy && (
          <div className="px-2 py-1.5">
            <p className="text-xs line-clamp-2">{creative.body_copy}<span className="text-muted-foreground">...See more</span></p>
          </div>
        )}

        {/* Media - 4:5 container for feed */}
        <div className="aspect-[4/5] bg-muted relative">
          {renderMedia('facebook', '4:5')}
        </div>

        {/* CTA Bar */}
        <div className="px-2 py-1.5 border-t bg-muted/30 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground uppercase truncate">FORM</p>
            <p className="text-xs font-medium truncate">{creative.headline || 'Invest next to the best...'}</p>
          </div>
          {creative.cta_text && (
            <Button size="sm" variant="secondary" className="text-xs h-7 px-2 ml-2 flex-shrink-0">
              {creative.cta_text}
            </Button>
          )}
        </div>

        {/* Reactions */}
        <div className="px-2 py-1 border-t text-[10px] text-muted-foreground">
          <span>👍 1</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-around px-2 py-1.5 border-t">
          <div className="flex items-center gap-1 text-muted-foreground">
            <ThumbsUp className="h-4 w-4" />
            <span className="text-xs">Like</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs">Comment</span>
          </div>
        </div>
      </Card>
    </div>
  );

  // Instagram Feed Preview
  const InstagramFeed = () => (
    <div className="flex-shrink-0 w-[280px]">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">📷</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Instagram feed</span>
        <MoreHorizontal className="h-4 w-4 ml-auto text-muted-foreground" />
      </div>
      <Card className="overflow-hidden bg-background border">
        {/* Header */}
        <div className="flex items-center gap-2 p-2">
          <Avatar className="h-8 w-8 ring-2 ring-pink-500 ring-offset-1">
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs font-bold">
              {clientName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs truncate">{clientName}</p>
            <p className="text-[10px] text-muted-foreground">Sponsored</p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Media - 4:5 container for feed */}
        <div className="aspect-[4/5] bg-muted relative">
          {renderMedia('instagram', '4:5')}
        </div>

        {/* CTA */}
        {creative.cta_text && (
          <div className="px-2 py-1.5 border-t bg-muted/30">
            <Button size="sm" className="w-full text-xs h-7">
              {creative.cta_text}
            </Button>
          </div>
        )}

        {/* Learn more */}
        <div className="px-2 py-1 border-t flex items-center justify-between">
          <span className="text-xs">Learn more</span>
          <ChevronUp className="h-4 w-4 rotate-90 text-muted-foreground" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Send className="h-5 w-5" />
          </div>
          <Bookmark className="h-5 w-5" />
        </div>

        {/* Caption */}
        <div className="px-2 pb-2">
          <p className="text-xs">
            <span className="font-semibold">{clientName.toLowerCase().replace(/\s/g, '')}</span>
            {' '}{creative.body_copy?.substring(0, 60)}... <span className="text-muted-foreground">more</span>
          </p>
        </div>
      </Card>
    </div>
  );

  // Instagram Stories Preview
  const InstagramStories = () => (
    <div className="flex-shrink-0 w-[200px]">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">📷</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Instagram Stories</span>
        <MoreHorizontal className="h-4 w-4 ml-auto text-muted-foreground" />
      </div>
      <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] relative">
        {/* Media Background - 9:16 container for stories */}
        <div className="absolute inset-0">
          {renderMedia('ig-stories', '9:16')}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

        {/* Top Bar */}
        <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
          <Avatar className="h-6 w-6 ring-1 ring-white">
            <AvatarFallback className="bg-primary text-primary-foreground text-[8px] font-bold">
              {clientName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-[10px] font-medium">{clientName}</span>
          <Badge className="bg-muted/50 text-white text-[8px] px-1 py-0">Sponsored</Badge>
          <X className="h-4 w-4 ml-auto text-white" />
        </div>

        {/* Bottom Content */}
        <div className="absolute bottom-12 left-2 right-2 text-white">
          <p className="text-[10px] line-clamp-2 mb-2">{creative.body_copy?.substring(0, 80)}... <span className="text-white/70">more</span></p>
        </div>

        {/* CTA */}
        {creative.cta_text && (
          <div className="absolute bottom-4 left-2 right-2">
            <Button size="sm" variant="outline" className="w-full text-xs h-7 bg-white/10 border-white/30 text-white hover:bg-white/20">
              <Link2 className="h-3 w-3 mr-1" />
              {creative.cta_text}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Facebook Stories Preview
  const FacebookStories = () => (
    <div className="flex-shrink-0 w-[200px]">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">f</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Facebook Stories</span>
        <MoreHorizontal className="h-4 w-4 ml-auto text-muted-foreground" />
      </div>
      <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] relative">
        {/* Media Background - 9:16 container for stories */}
        <div className="absolute inset-0">
          {renderMedia('fb-stories', '9:16')}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

        {/* Top Bar */}
        <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
          <Avatar className="h-6 w-6 ring-1 ring-white">
            <AvatarFallback className="bg-blue-600 text-white text-[8px] font-bold">
              {clientName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-[10px] font-medium">{clientName}</span>
          <MoreHorizontal className="h-4 w-4 ml-auto text-white" />
          <X className="h-4 w-4 text-white" />
        </div>

        {/* Bottom Content */}
        <div className="absolute bottom-12 left-2 right-2 text-white text-center">
          <p className="text-[10px] line-clamp-2">{creative.body_copy?.substring(0, 60)}... <span className="text-blue-400">More</span></p>
        </div>

        {/* CTA */}
        {creative.cta_text && (
          <div className="absolute bottom-4 left-2 right-2">
            <Button size="sm" variant="outline" className="w-full text-xs h-7 bg-white/10 border-white/30 text-white hover:bg-white/20">
              <Link2 className="h-3 w-3 mr-1" />
              {creative.cta_text}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Volume Control for Videos */}
      {creative.type === 'video' && (
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleMute}
            className="gap-2"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </Button>
        </div>
      )}

      {/* Horizontal Scroll Preview */}
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4">
          <FacebookFeed />
          <InstagramFeed />
          <InstagramStories />
          <FacebookStories />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
