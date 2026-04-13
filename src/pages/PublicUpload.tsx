import { useParams } from 'react-router-dom';
import { useClientByToken } from '@/hooks/useClients';
import { ClientUploadPortal } from '@/components/uploads/ClientUploadPortal';
import { CashBagLoader } from '@/components/ui/CashBagLoader';

function PublicUploadContent() {
  const { token } = useParams<{ token: string }>();
  const { data: client, isLoading } = useClientByToken(token);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <CashBagLoader />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-lg">Client not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">{client.name}</h1>
          <p className="text-muted-foreground mt-1">Upload your files below</p>
        </div>
        <ClientUploadPortal
          clientId={client.id}
          clientName={client.name}
          isPublicView={true}
        />
      </div>
    </div>
  );
}

export default function PublicUpload() {
  return <PublicUploadContent />;
}
