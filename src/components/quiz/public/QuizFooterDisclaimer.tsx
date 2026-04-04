interface QuizFooterDisclaimerProps {
  brandName: string;
  disclaimerText?: string | null;
}

export function QuizFooterDisclaimer({ brandName, disclaimerText }: QuizFooterDisclaimerProps) {
  return (
    <footer className="border-t border-border py-6 px-4">
      <div className="container max-w-2xl mx-auto text-center">
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          {disclaimerText || `© ${new Date().getFullYear()} ${brandName}. All rights reserved. This is not an offer to sell securities. Investment opportunities are available only to accredited investors.`}
        </p>
      </div>
    </footer>
  );
}
