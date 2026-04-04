import { AppLayout } from '@/components/layout/AppLayout';
import { AvatarAdProvider } from '@/context/AvatarAdContext';
import { AvatarAdWizard } from '@/components/avatar-ad/AvatarAdWizard';

export default function AvatarAdGeneratorPage() {
  return (
    <AppLayout>
      <div className="container mx-auto py-6 max-w-5xl">
        <AvatarAdProvider>
          <AvatarAdWizard />
        </AvatarAdProvider>
      </div>
    </AppLayout>
  );
}
