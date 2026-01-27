import { cn } from '@/lib/utils';

interface IPhoneMockupProps {
  url: string;
  title?: string;
  className?: string;
}

export function IPhoneMockup({ url, title, className }: IPhoneMockupProps) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      )}
      <div className="relative">
        {/* iPhone Frame */}
        <div className="relative bg-muted-foreground/80 rounded-[3rem] p-2 shadow-2xl">
          {/* Inner bezel */}
          <div className="bg-foreground rounded-[2.5rem] p-1">
            {/* Notch area */}
            <div className="relative bg-background rounded-[2rem] overflow-hidden">
              {/* Dynamic Island / Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
                <div className="w-24 h-7 bg-foreground rounded-b-2xl flex items-center justify-center">
                  <div className="w-3 h-3 bg-muted rounded-full" />
                </div>
              </div>
              
              {/* Screen Content */}
              <div className="w-[280px] h-[580px] overflow-hidden">
                <iframe
                  src={url}
                  className="w-full h-full border-0 scale-[0.8] origin-top-left"
                  style={{ 
                    width: '350px', 
                    height: '725px',
                    pointerEvents: 'auto'
                  }}
                  title={title || 'Funnel Preview'}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Side buttons */}
        <div className="absolute left-0 top-24 w-1 h-8 bg-muted-foreground rounded-l-sm" />
        <div className="absolute left-0 top-36 w-1 h-12 bg-muted-foreground rounded-l-sm" />
        <div className="absolute left-0 top-52 w-1 h-12 bg-muted-foreground rounded-l-sm" />
        <div className="absolute right-0 top-32 w-1 h-16 bg-muted-foreground rounded-r-sm" />
      </div>
    </div>
  );
}
