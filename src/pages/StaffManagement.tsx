import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserCog, KeyRound, Group, ToggleRight } from 'lucide-react';
import StaffDirectory from '@/components/staff/StaffDirectory';
import RoleManager from '@/components/staff/RoleManager';
import GroupManager from '@/components/staff/GroupManager';
import ModulePermissionsPanel from '@/components/staff/ModulePermissionsPanel';

export default function StaffManagement() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState('staff');

  if (role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserCog className="h-6 w-6 text-primary" />
          Staff Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage staff profiles, roles, groups, and module permissions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="staff" className="flex items-center gap-1.5">
            <UserCog className="h-4 w-4" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="groups" className="flex items-center gap-1.5">
            <Group className="h-4 w-4" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-1.5">
            <ToggleRight className="h-4 w-4" />
            Modules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-6">
          <StaffDirectory />
        </TabsContent>
        <TabsContent value="roles" className="mt-6">
          <RoleManager />
        </TabsContent>
        <TabsContent value="groups" className="mt-6">
          <GroupManager />
        </TabsContent>
        <TabsContent value="modules" className="mt-6">
          <ModulePermissionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
