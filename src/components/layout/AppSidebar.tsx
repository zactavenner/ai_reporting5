import {
  LayoutDashboard,
  LayoutGrid,
  Bot,
  Video,
  Upload,
  Smartphone,
  Handshake,
  MessageSquare,
  Receipt,
  Database,
  Shield,
  FileText,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';

interface AppSidebarProps {
  pendingTaskCount?: number;
  pendingCreativeCount?: number;
  pendingMeetingCount?: number;
  isAdmin?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const mainItems = [
  { title: 'Dashboard', value: 'dashboard', icon: LayoutDashboard },
  { title: 'Tasks', value: 'tasks', icon: LayoutGrid },
  { title: 'AI Hub', value: 'ai', icon: Bot },
  { title: 'Meetings', value: 'meetings', icon: Video },
  { title: 'Creatives', value: 'creatives', icon: Upload },
  { title: 'Funnel', value: 'funnel', icon: Smartphone },
  { title: 'Deals', value: 'deals', icon: Handshake },
  { title: 'Outreach', value: 'outreach', icon: MessageSquare },
];

const utilItems = [
  { title: 'Database', value: 'database', icon: Database },
  { title: 'Spam List', value: 'spam', icon: Shield },
  { title: 'Briefs', value: 'briefs', icon: FileText },
];

export function AppSidebar({
  pendingTaskCount = 0,
  pendingCreativeCount = 0,
  pendingMeetingCount = 0,
  isAdmin = false,
  activeTab,
  onTabChange,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const getBadge = (value: string) => {
    if (value === 'meetings' && pendingMeetingCount > 0) return pendingMeetingCount;
    if (value === 'creatives' && pendingCreativeCount > 0) return pendingCreativeCount;
    return 0;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {/* Logo */}
        <div className="px-3 py-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-xs tracking-tight">HPA</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight">HPA Dashboard</span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const badge = getBadge(item.value);
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      isActive={activeTab === item.value}
                      onClick={() => onTabChange(item.value)}
                      tooltip={item.title}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                      {!collapsed && badge > 0 && (
                        <Badge variant="default" className="ml-auto h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5">
                          {badge}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeTab === 'billing'}
                    onClick={() => onTabChange('billing')}
                    tooltip="Billing"
                  >
                    <Receipt className="h-4 w-4" />
                    {!collapsed && <span>Billing</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Utilities</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {utilItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    isActive={activeTab === item.value}
                    onClick={() => onTabChange(item.value)}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
