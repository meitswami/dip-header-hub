import {
  LayoutDashboard, FolderOpen, Upload, MessageSquare, FileText,
  Users, Shield, LogOut, BookOpen, Brain, FolderArchive, Languages,
  GitCompare, Trash2, Download, Cog, Mail, UserCog, KeyRound, ShieldCheck, Group, ToggleRight
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { HealthIndicator } from '@/components/HealthIndicator';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AppSidebar() {
  const { role, profile, signOut } = useAuth();
  const { lang, setLang, t } = useLang();
  const { isModuleAllowed } = useModulePermissions();

  // Each nav item can optionally have a moduleKey for permission filtering
  const mainNav = [
    { title: t('nav.dashboard'), url: '/', icon: LayoutDashboard },
    { title: t('nav.cases'), url: '/cases', icon: FolderOpen },
    { title: t('nav.upload'), url: '/upload', icon: Upload, moduleKey: 'data_upload' },
    { title: t('nav.chat'), url: '/chat', icon: MessageSquare, moduleKey: 'ai_chat' },
    { title: t('nav.reports'), url: '/reports', icon: FileText, moduleKey: 'reports' },
    { title: t('nav.documents'), url: '/documents', icon: FolderArchive, moduleKey: 'documents' },
    { title: t('nav.kb'), url: '/knowledge-base', icon: Brain, moduleKey: 'knowledge_base' },
    { title: t('nav.legal'), url: '/legal', icon: BookOpen, moduleKey: 'legal_reference' },
    { title: 'Case Compare', url: '/compare', icon: GitCompare, moduleKey: 'case_compare' },
    { title: 'Messages', url: '/messages', icon: Mail },
  ];

  const rbacNav = [
    { title: 'Staff Management', url: '/admin/staff', icon: UserCog },
  ];

  const adminNav = [
    { title: t('nav.settings'), url: '/admin/settings', icon: Cog },
    { title: 'Data Cleanup', url: '/admin/cleanup', icon: Trash2 },
    { title: 'Data Export', url: '/admin/export', icon: Download },
  ];

  // Filter nav items by module permissions (admins always see everything)
  const filteredMainNav = role === 'admin'
    ? mainNav
    : mainNav.filter(item => !item.moduleKey || isModuleAllowed(item.moduleKey));

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">DIP</span>
            <span className="text-xs text-muted-foreground">{t('nav.platform')}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              >
                <Languages className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{lang === 'en' ? 'हिन्दी में बदलें' : 'Switch to English'}</TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMainNav.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === '/'} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role === 'admin' && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>
                <ShieldCheck className="mr-1 h-3.5 w-3.5 inline" />
                RBAC & Staff
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {rbacNav.map(item => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>{t('nav.admin')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNav.map(item => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border space-y-2">
        <HealthIndicator />
        <div className="flex items-center justify-between">
          <NavLink to="/profile" className="flex flex-col min-w-0 hover:opacity-80" activeClassName="">
            <span className="text-sm font-medium truncate">{profile?.full_name || 'Officer'}</span>
            <span className="text-xs text-muted-foreground capitalize">{role || 'loading...'}</span>
          </NavLink>
          <Button variant="ghost" size="icon" onClick={signOut} title={t('nav.signout')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
