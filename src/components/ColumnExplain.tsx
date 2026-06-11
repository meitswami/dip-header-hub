import { useEffect, useState } from 'react';
import { api, type ExplainResult } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Info, Loader2, HelpCircle } from 'lucide-react';

interface Props {
  /** Column header text, field name, or abbreviation */
  term: string;
  /** Optional case id — used to include example values from the current case */
  caseId?: string | null;
  /** Render style: icon button (default) or underline-on-hover label */
  as?: 'icon' | 'label';
  /** Only used when `as='label'` — content of the label (defaults to `term`) */
  label?: React.ReactNode;
}

/**
 * Lightweight popover that calls `/explain` the first time it's opened and
 * shows an investigator-friendly definition (English + Hindi when available),
 * abbreviation expansion, and up to 3 example values from the current case.
 */
export function ColumnExplain({ term, caseId, as = 'icon', label }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExplainResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || data || !term) return;
    let cancelled = false;
    setLoading(true);
    api
      .explainTerm(term, caseId)
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ term, matched: false, message: 'Lookup failed.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, data, term, caseId]);

  const trigger =
    as === 'label' ? (
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:underline decoration-dotted underline-offset-2 text-left"
      >
        {label ?? term}
        <HelpCircle className="h-3 w-3 opacity-60" />
      </button>
    ) : (
      <button
        type="button"
        className="inline-flex items-center justify-center h-5 w-5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Explain this field"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={e => e.stopPropagation()}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 space-y-2"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{term}</p>
            {data?.matched && data.category && (
              <Badge variant="outline" className="text-[10px] mt-0.5 uppercase">
                {data.category}
              </Badge>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up…
          </div>
        ) : !data ? null : !data.matched ? (
          <p className="text-xs text-muted-foreground">
            {data.message || 'No dictionary entry found for this term.'}
          </p>
        ) : (
          <div className="space-y-2 text-xs leading-relaxed">
            {data.abbreviation && (
              <p className="text-muted-foreground italic">
                <span className="font-medium">{term.toUpperCase()}</span> — {data.abbreviation}
              </p>
            )}
            {data.short && <p>{data.short}</p>}
            {data.short_hi && (
              <p className="text-muted-foreground">{data.short_hi}</p>
            )}
            {data.detail && (
              <p className="text-muted-foreground">{data.detail}</p>
            )}
            {data.examples && data.examples.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Examples from this case
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.examples.map(e => (
                    <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {data.aliases && data.aliases.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Also called
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.aliases.slice(0, 6).map(a => (
                    <Badge key={a} variant="outline" className="text-[10px] font-normal">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ColumnExplain;
