import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarIcon, Trash2, X, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface BulkActionBarProps {
  selectedCount: number;
  onChangeDueDate: (date: Date) => void;
  onMarkComplete: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
  isCompleting?: boolean;
}
 
export function BulkActionBar({
  selectedCount,
  onChangeDueDate,
  onMarkComplete,
  onDelete,
  onClearSelection,
  isUpdating = false,
  isDeleting = false,
  isCompleting = false,
}: BulkActionBarProps) {
   const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
   const [calendarOpen, setCalendarOpen] = useState(false);
   
   const handleDateSelect = (date: Date | undefined) => {
     if (date) {
       onChangeDueDate(date);
       setCalendarOpen(false);
     }
   };
   
   const handleConfirmDelete = () => {
     onDelete();
     setDeleteDialogOpen(false);
   };
   
   if (selectedCount === 0) return null;
   
   return (
     <>
       <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
         <div className="flex items-center gap-3 bg-background border-2 border-border shadow-lg rounded-lg px-4 py-3">
           <span className="text-sm font-medium">
             {selectedCount} task{selectedCount > 1 ? 's' : ''} selected
           </span>
           
           <div className="h-4 w-px bg-border" />
           
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onMarkComplete}
              disabled={isCompleting}
              className="border-success/50 text-success hover:bg-success/10"
            >
              {isCompleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Mark Complete
            </Button>
            
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={isUpdating}>
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CalendarIcon className="h-4 w-4 mr-2" />
                  )}
                  Change Due Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  onSelect={handleDateSelect}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
           
           <div className="h-4 w-px bg-border" />
           
           <Button variant="ghost" size="sm" onClick={onClearSelection}>
             <X className="h-4 w-4" />
           </Button>
         </div>
       </div>
       
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete {selectedCount} task{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
             <AlertDialogDescription>
               This action cannot be undone. The selected tasks will be permanently deleted.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               Delete
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
     </>
   );
 }