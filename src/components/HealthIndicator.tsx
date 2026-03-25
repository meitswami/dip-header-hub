import { useHealthCheck, ServiceStatus } from '@/hooks/useHealthCheck';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Database, Bot, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const statusColor: Record<ServiceStatus, string> = {
  ok: 'bg-green-500',
  error: 'bg-destructive',
  checking: 'bg-warning animate-pulse',
};

const statusLabel: Record<ServiceStatus, string> = {
  ok: 'Connected',
  error: 'Offline',
  checking: 'Checking…',
};

function Dot({ status }: { status: ServiceStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${statusColor[status]}`} />;
}

export function HealthIndicator() {
  const { health, recheck } = useHealthCheck();

  const items = [
    { label: 'Database', status: health.database, icon: Database },
    { label: 'Ollama AI', status: health.ollama, icon: Bot },
    { label: 'Storage', status: health.storage, icon: HardDrive },
  ];

  const allOk = Object.values(health).every(s => s === 'ok');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={recheck}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${allOk ? 'bg-green-500' : 'bg-warning'}`} />
          <span className="hidden md:inline">{allOk ? 'All Systems OK' : 'Issues Detected'}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="space-y-1.5 text-xs">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon className="h-3 w-3" />
            <span className="flex-1">{item.label}</span>
            <Dot status={item.status} />
            <span className="text-muted-foreground">{statusLabel[item.status]}</span>
          </div>
        ))}
        <div className="pt-1 text-muted-foreground flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Click to refresh
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
