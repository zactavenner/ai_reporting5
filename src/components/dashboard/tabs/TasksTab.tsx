import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';

export const TasksTab = () => {
  return (
    <div className="space-y-6">
      <SectionErrorBoundary sectionName="Task Board">
        <TaskBoardView />
      </SectionErrorBoundary>
    </div>
  );
};
