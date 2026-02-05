 import { useNavigate, useParams } from 'react-router-dom';
 import { ArrowLeft } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { CreativesSection } from '@/components/creative/CreativesSection';
 import { ThemeToggle } from '@/components/theme/ThemeToggle';
 import { CashBagLoader } from '@/components/ui/CashBagLoader';
 import { useClient } from '@/hooks/useClients';
 
 export default function ClientCreatives() {
   const { clientId } = useParams<{ clientId: string }>();
   const navigate = useNavigate();
   const { data: client, isLoading } = useClient(clientId);
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <CashBagLoader message="Loading creatives..." />
       </div>
     );
   }
 
   if (!client) {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <p>Client not found</p>
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-background">
       <header className="border-b-2 border-border bg-card px-6 py-4">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
             <Button variant="ghost" size="sm" onClick={() => navigate(`/client/${clientId}`)}>
               <ArrowLeft className="h-4 w-4 mr-2" />
               Back to Dashboard
             </Button>
           </div>
           <ThemeToggle />
         </div>
         <div className="mt-4">
           <h1 className="text-2xl font-bold">{client.name} - Creatives</h1>
           <p className="text-sm text-muted-foreground">Creative approval and generation</p>
         </div>
       </header>
 
       <main className="p-6 max-w-7xl mx-auto">
         <CreativesSection 
           clientId={client.id} 
           clientName={client.name} 
           isPublicView={false}
         />
       </main>
     </div>
   );
 }