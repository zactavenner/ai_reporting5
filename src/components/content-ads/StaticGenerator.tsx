import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Download, Film } from "lucide-react";
import { toast } from "sonner";
import { imageToAnimatedGif } from "@/lib/gifMaker";

/**
 * Quick static-ad generator for the Content → Static Ads tab.
 * Defaults to GPT Image 2.6; can also output an animated GIF version
 * (subtle zoom loop) rendered in-browser with ffmpeg.wasm.
 */

const IMAGE_MODELS = [
  { value: "gpt-image-2.6", label: "GPT Image 2.6", hint: "Default" },
  { value: "gpt-image-2", label: "GPT Image 2" },
  { value: "nano-banana-pro-2", label: "Nano Banana Pro" },
];

const ASPECTS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "9:16", label: "9:16 Story" },
  { value: "16:9", label: "16:9 Wide" },
];

interface Props {
  clientId: string;
  clientName: string;
  offerSummary?: string;
}

export function StaticGenerator({ clientId, clientName, offerSummary }: Props) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-image-2.6");
  const [aspect, setAspect] = useState("1:1");
  const [makeGif, setMakeGif] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the ad you want first");
      return;
    }
    setGenerating(true);
    setImageUrl(null);
    setGifUrl(null);
    setGifProgress(null);
    try {
      const fullPrompt = offerSummary
        ? `${prompt.trim()}\n\nOffer context: ${offerSummary}`
        : prompt.trim();
      const { data, error } = await supabase.functions.invoke("generate-static-ad", {
        body: {
          prompt: fullPrompt,
          clientId,
          aspectRatio: aspect,
          imageModel: model,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const url = data?.imageUrl as string | undefined;
      if (!url) throw new Error("No image came back from the generator");
      setImageUrl(url);
      toast.success("Static ad generated");

      if (makeGif) {
        setGifProgress(0);
        try {
          const imgResp = await fetch(url);
          const imgBlob = await imgResp.blob();
          const gifBlob = await imageToAnimatedGif(imgBlob, (r) => setGifProgress(r));
          setGifUrl(URL.createObjectURL(gifBlob));
          toast.success("GIF version ready");
        } catch (gifErr: any) {
          console.warn("GIF conversion failed:", gifErr);
          toast.error("GIF conversion failed — the static image is still available");
        } finally {
          setGifProgress(null);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Generate a static ad</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Describe the ad for ${clientName}… (hook, visual style, call to action)`}
            className="min-h-[90px] text-sm rounded-xl"
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8 w-[180px] text-xs rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}{m.hint ? ` · ${m.hint}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Aspect</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger className="h-8 w-[130px] text-xs rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECTS.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch id="gif-toggle" checked={makeGif} onCheckedChange={setMakeGif} />
              <Label htmlFor="gif-toggle" className="text-xs flex items-center gap-1 cursor-pointer">
                <Film className="h-3.5 w-3.5" /> Also make GIF
              </Label>
            </div>
            <Button onClick={generate} disabled={generating} size="sm" className="h-8 ml-auto">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
        <Card className="p-3 min-h-[220px] grid place-items-center bg-muted/20">
          {generating ? (
            <div className="text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {gifProgress != null
                  ? `Rendering GIF… ${Math.round(gifProgress * 100)}%`
                  : "Generating image…"}
              </p>
            </div>
          ) : imageUrl ? (
            <div className="space-y-2 w-full">
              <img src={imageUrl} alt="Generated static ad" className="w-full rounded-lg object-contain max-h-[260px]" />
              {gifUrl && (
                <div className="space-y-1">
                  <Badge variant="secondary" className="text-[10px]">GIF version</Badge>
                  <img src={gifUrl} alt="Animated GIF version" className="w-full rounded-lg object-contain max-h-[200px]" />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={async () => {
                    try {
                      const blob = await (await fetch(imageUrl)).blob();
                      const ext = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
                      const href = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = href;
                      a.download = `ad.${ext}`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(href), 1000);
                    } catch {
                      window.open(imageUrl, "_blank", "noopener");
                    }
                  }}
                >
                  <Download className="h-3 w-3 mr-1" /> Image
                </Button>
                {gifUrl && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" asChild>
                    <a href={gifUrl} download="ad.gif">
                      <Download className="h-3 w-3 mr-1" /> GIF
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center px-4">
              Generated ads appear here. Turn on “Also make GIF” to get an animated version too.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
