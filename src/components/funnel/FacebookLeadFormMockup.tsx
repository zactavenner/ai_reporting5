import { cn } from '@/lib/utils';
import type { DeviceType } from './DeviceSwitcher';

interface FacebookLeadFormMockupProps {
  stepName?: string;
  deviceType: DeviceType;
  className?: string;
}

export function FacebookLeadFormMockup({ stepName, deviceType, className }: FacebookLeadFormMockupProps) {
  const isDesktop = deviceType === 'desktop';
  const isTablet = deviceType === 'tablet';

  // Scale factor based on device
  const containerWidth = isDesktop ? 500 : isTablet ? 400 : 280;
  const containerHeight = isDesktop ? 620 : isTablet ? 580 : 520;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {stepName && (
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{stepName}</h3>
      )}
      
      {/* Device frame wrapper */}
      <div 
        className="relative bg-foreground rounded-[24px] p-3 shadow-xl"
        style={deviceType === 'phone' ? {} : deviceType === 'tablet' ? {} : {}}
      >
        {deviceType === 'phone' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 bg-foreground rounded-b-2xl z-10" />
        )}
        {deviceType === 'tablet' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-muted" />
        )}

        {/* Screen */}
        <div 
          className="relative rounded-[12px] overflow-hidden"
          style={{ width: `${containerWidth}px`, height: `${containerHeight}px` }}
        >
          {/* Facebook Lead Form UI */}
          <div className="w-full h-full bg-[#ffffff] flex flex-col text-[#1c1e21] overflow-y-auto">
            {/* FB Header */}
            <div className="bg-[#1877F2] px-4 py-3 flex items-center gap-2 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-6 h-6 fill-white flex-shrink-0">
                <path d="M20.18 35.87C29.07 34.58 36 26.82 36 17.5 36 7.84 28.16 0 18.5 0S1 7.84 1 17.5c0 8.52 5.74 15.68 13.55 17.82V22.5h-3.93v-5h3.93V14c0-4.02 2.34-6.16 5.88-6.16 1.72 0 3.52.31 3.52.31v3.95h-1.98c-1.95 0-2.56 1.21-2.56 2.46v3.01h4.42l-.71 5h-3.71v13.31z" />
              </svg>
              <span className="text-white font-semibold text-sm">Instant Form</span>
            </div>

            {/* Form Content */}
            <div className="flex-1 px-4 py-3 space-y-3">
              {/* Business info header */}
              <div className="flex items-center gap-2 pb-2 border-b border-[#dadde1]">
                <div className="w-10 h-10 rounded-full bg-[#e4e6eb] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#65676b]">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#1c1e21]">Investment Opportunity</p>
                  <p className="text-[10px] text-[#65676b]">Sponsored · Learn More</p>
                </div>
              </div>

              <p className="text-xs text-[#65676b] leading-relaxed">
                Complete this form to learn more about this investment opportunity.
              </p>

              {/* Question 1: Accredited Investor */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#1c1e21]">
                  Are you an accredited investor? <span className="text-[#e41e3f]">*</span>
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 px-3 py-2.5 border border-[#1877F2] rounded-lg bg-[#e7f3ff] cursor-default">
                    <div className="w-4 h-4 rounded-full border-2 border-[#1877F2] flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-[#1877F2]" />
                    </div>
                    <span className="text-xs text-[#1c1e21]">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2.5 border border-[#dadde1] rounded-lg cursor-default">
                    <div className="w-4 h-4 rounded-full border-2 border-[#dadde1] flex-shrink-0" />
                    <span className="text-xs text-[#1c1e21]">No</span>
                  </label>
                </div>
              </div>

              {/* Question 2: Liquidity */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#1c1e21]">
                  Available liquidity <span className="text-[#e41e3f]">*</span>
                </label>
                <div className="space-y-1.5">
                  {['$50k or less', '$50k – $100k', '$100k – $250k', '$250k – $500k', '$500k – $1M', '$1M+'].map((range, i) => (
                    <label
                      key={range}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 border rounded-lg cursor-default",
                        i === 3 
                          ? "border-[#1877F2] bg-[#e7f3ff]" 
                          : "border-[#dadde1]"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        i === 3 ? "border-[#1877F2]" : "border-[#dadde1]"
                      )}>
                        {i === 3 && <div className="w-2 h-2 rounded-full bg-[#1877F2]" />}
                      </div>
                      <span className="text-xs text-[#1c1e21]">{range}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Prefill section header */}
              <div className="pt-2 border-t border-[#dadde1]">
                <p className="text-[10px] text-[#65676b] mb-2">
                  The following info was provided by Facebook. Please confirm your details.
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1c1e21]">Full name</label>
                <div className="px-3 py-2.5 border border-[#dadde1] rounded-lg bg-[#f0f2f5]">
                  <span className="text-xs text-[#65676b]">John Smith</span>
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1c1e21]">Email</label>
                <div className="px-3 py-2.5 border border-[#dadde1] rounded-lg bg-[#f0f2f5]">
                  <span className="text-xs text-[#65676b]">john.smith@email.com</span>
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#1c1e21]">Phone number</label>
                <div className="px-3 py-2.5 border border-[#dadde1] rounded-lg bg-[#f0f2f5]">
                  <span className="text-xs text-[#65676b]">(555) 123-4567</span>
                </div>
              </div>

              {/* Privacy disclaimer */}
              <p className="text-[9px] text-[#65676b] leading-relaxed">
                By clicking Submit, you agree that the business may contact you using the information provided. 
                Read Facebook's <span className="text-[#1877F2]">Privacy Policy</span>.
              </p>
            </div>

            {/* Submit Button - sticky at bottom */}
            <div className="px-4 py-3 border-t border-[#dadde1] bg-white flex-shrink-0">
              <div className="w-full py-2.5 bg-[#1877F2] rounded-lg flex items-center justify-center">
                <span className="text-white font-semibold text-sm">Submit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        {(deviceType === 'phone' || deviceType === 'tablet') && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-muted-foreground/50 rounded-full" />
        )}
      </div>
    </div>
  );
}
