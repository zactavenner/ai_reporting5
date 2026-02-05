 import { useNavigate, useParams } from 'react-router-dom';
 import { ArrowLeft } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { CreativeApproval } from '@/components/creative/CreativeApproval';
 import { CashBagLoader } from '@/components/ui/CashBagLoader';
 import { useClientByToken } from '@/hooks/useClients';
 import { useClientSettings } from '@/hooks/useClientSettings';
 import { DateFilterProvider } from '@/contexts/DateFilterContext';
 import { TeamMemberProvider } from '@/contexts/TeamMemberContext';
 
 function PublicCreativesContent() {
   const { token } = useParams<{ token: string }>();
   const navigate = useNavigate();
   const { data: client, isLoading } = useClientByToken(token);
   const { data: clientSettings } = useClientSettings(client?.id);
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <CashBagLoader message="Loading creatives..." />
       </div>
     );
   }
 
   if (!client) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="text-center border-2 border-border bg-card p-8 max-w-md">
           <h1 className="text-2xl font-bold mb-2">Not Found</h1>
           <p className="text-muted-foreground">This link is invalid or has expired.</p>
         </div>
       </div>
     );
   }
 
   const publicLinkPassword = clientSettings?.public_link_password;
 
   const content = (
     <div className="min-h-screen bg-background">
       <header className="border-b-2 border-border bg-card px-6 py-4">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
             <Button variant="ghost" size="sm" onClick={() => navigate(`/public/${token}`)}>
               <ArrowLeft className="h-4 w-4 mr-2" />
               Back to Report
             </Button>
           </div>
         </div>
         <div className="mt-4">
           <h1 className="text-2xl font-bold">{client.name} - Creatives</h1>
           <p className="text-sm text-muted-foreground">Creative approval portal</p>
         </div>
       </header>
 
       <main className="p-6 max-w-7xl mx-auto">
         <CreativeApproval 
           clientId={client.id} 
           clientName={client.name} 
           isPublicView={true}
         />
       </main>
     </div>
   );
 
   return content;
 }
 
 export default function PublicCreatives() {
   return (
     <DateFilterProvider>
       <TeamMemberProvider>
         <PublicCreativesContent />
       </TeamMemberProvider>
     </DateFilterProvider>
   );
 }