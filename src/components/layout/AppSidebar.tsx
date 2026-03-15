import {
  LayoutDashboard,
  BarChart3,
  LayoutGrid,
  Bot,
  Video,
  MessageSquare,
  Handshake,
  Upload,
  Smartphone,
  FileText,
  Settings,
  Database,
  Shield,
  Receipt,
  Palette,
  ChevronDown,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AppSidebarProps {
  pendingTaskCount?: number;
  pendingCreativeCount?: number;
  pendingMeetingCount?: number;
  isAdmin?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navStructure = [
  {
    title: 'Dashboard',
    value: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Reporting',
    value: 'reporting',
    icon: BarChart3,
    children: [
      { title: 'Tasks', value: 'tasks', icon: LayoutGrid },
      { title: 'AI Hub', value: 'ai', icon: Bot },
      { title: 'Meetings', value: 'meetings', icon: Video },
      { title: 'Deals', value: 'deals', icon: Handshake },
      { title: 'Outreach', value: 'outreach', icon: MessageSquare },
    ],
  },
  {
    title: 'Creatives',
    value: 'creatives',
    icon: Palette,
    children: [
      { title: 'Approvals', value: 'creatives', icon: Upload },
      { title: 'Briefs', value: 'briefs', icon: FileText },
    ],
  },
  {
    title: 'Funnel',
    value: 'funnel',
    icon: Smartphone,
  },
  {
    title: 'Settings',
    value: 'settings-group',
    icon: Settings,
    children: [
      { title: 'Database', value: 'database', icon: Database },
      { title: 'Spam List', value: 'spam', icon: Shield },
    ],
  },
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

  const isChildActive = (item: typeof navStructure[number]) => {
    if (!item.children) return false;
    return item.children.some(c => c.value === activeTab);
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
          <SidebarGroupContent>
            <SidebarMenu>
              {navStructure.map((item) => {
                if (!item.children) {
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
                }

                const active = isChildActive(item);

                return (
                  <Collapsible key={item.value} defaultOpen={active} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.title}
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                          {!collapsed && (
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => {
                            const badge = getBadge(child.value);
                            return (
                              <SidebarMenuSubItem key={child.value}>
                                <SidebarMenuSubButton
                                  isActive={activeTab === child.value}
                                  onClick={() => onTabChange(child.value)}
                                >
                                  <child.icon className="h-3.5 w-3.5" />
                                  <span>{child.title}</span>
                                  {badge > 0 && (
                                    <Badge variant="default" className="ml-auto h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5">
                                      {badge}
                                    </Badge>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                          {/* Add Billing under Settings for admins */}
                          {item.value === 'settings-group' && isAdmin && (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                isActive={activeTab === 'billing'}
                                onClick={() => onTabChange('billing')}
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                <span>Billing</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
