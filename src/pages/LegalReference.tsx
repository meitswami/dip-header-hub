import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, BookOpen } from 'lucide-react';

const legalData: Record<string, { title: string; sections: { section: string; title: string; summary: string }[] }> = {
  ipc: {
    title: 'Indian Penal Code (IPC)',
    sections: [
      { section: '420', title: 'Cheating', summary: 'Cheating and dishonestly inducing delivery of property. Punishment: up to 7 years imprisonment and fine.' },
      { section: '406', title: 'Criminal Breach of Trust', summary: 'Whoever commits criminal breach of trust. Punishment: up to 3 years imprisonment, or fine, or both.' },
      { section: '419', title: 'Punishment for Cheating by Personation', summary: 'Whoever cheats by personation. Punishment: up to 3 years imprisonment, or fine, or both.' },
      { section: '468', title: 'Forgery for Purpose of Cheating', summary: 'Whoever commits forgery intending to use it for cheating. Punishment: up to 7 years imprisonment and fine.' },
      { section: '471', title: 'Using as Genuine a Forged Document', summary: 'Whoever fraudulently or dishonestly uses as genuine any document or electronic record. Punishment: same as forging.' },
      { section: '302', title: 'Punishment for Murder', summary: 'Whoever commits murder shall be punished with death or imprisonment for life and fine.' },
      { section: '307', title: 'Attempt to Murder', summary: 'Whoever does any act with intention or knowledge, and under circumstances, capable of causing death. Punishment: up to 10 years imprisonment and fine.' },
    ],
  },
  it_act: {
    title: 'Information Technology Act, 2000',
    sections: [
      { section: '66', title: 'Computer Related Offences', summary: 'Dishonestly or fraudulently doing any act referred to in section 43. Punishment: up to 3 years imprisonment or fine up to 5 lakhs.' },
      { section: '66C', title: 'Identity Theft', summary: 'Fraudulently or dishonestly making use of electronic signature, password or any other unique identification feature. Punishment: up to 3 years imprisonment and fine up to 1 lakh.' },
      { section: '66D', title: 'Cheating by Personation', summary: 'Cheating by personation by using computer resource or communication device. Punishment: up to 3 years imprisonment and fine up to 1 lakh.' },
      { section: '67', title: 'Publishing Obscene Material', summary: 'Publishing or transmitting obscene material in electronic form. Punishment: up to 3 years imprisonment and fine up to 5 lakhs on first conviction.' },
      { section: '43', title: 'Penalty for Damage to Computer System', summary: 'Unauthorized access, download, virus introduction, disruption, denial of access, etc. Compensation up to 1 crore.' },
    ],
  },
  crpc: {
    title: 'Code of Criminal Procedure (CrPC)',
    sections: [
      { section: '154', title: 'Information in Cognizable Cases (FIR)', summary: 'Every information relating to the commission of a cognizable offence shall be reduced to writing by the officer in charge of the police station.' },
      { section: '161', title: 'Examination of Witnesses by Police', summary: 'Any police officer making an investigation may examine orally any person supposed to be acquainted with the facts.' },
      { section: '164', title: 'Recording of Confessions and Statements', summary: 'Confessions and statements recorded by a Metropolitan or Judicial Magistrate.' },
      { section: '173', title: 'Report of Police Officer (Chargesheet)', summary: 'Every investigation shall be completed without unnecessary delay and the report forwarded to the Magistrate.' },
    ],
  },
  evidence: {
    title: 'Indian Evidence Act',
    sections: [
      { section: '65B', title: 'Admissibility of Electronic Records', summary: 'Electronic record produced by a computer can be admitted as evidence if certified as per conditions specified.' },
      { section: '3', title: 'Interpretation', summary: 'Defines evidence as all statements and documents produced for court inspection, including electronic records.' },
      { section: '45A', title: 'Opinion of Examiner of Electronic Evidence', summary: 'Opinions of an electronic evidence examiner are considered relevant facts.' },
    ],
  },
};

export default function LegalReference() {
  const [search, setSearch] = useState('');

  const filterSections = (sections: typeof legalData.ipc.sections) =>
    sections.filter(s => s.section.includes(search) || s.title.toLowerCase().includes(search.toLowerCase()) || s.summary.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Legal Knowledge Base</h1>
          <p className="text-muted-foreground">Reference IPC, IT Act, CrPC, and Indian Evidence Act</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by section number or keyword..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="ipc">
        <TabsList>
          <TabsTrigger value="ipc">IPC</TabsTrigger>
          <TabsTrigger value="it_act">IT Act</TabsTrigger>
          <TabsTrigger value="crpc">CrPC</TabsTrigger>
          <TabsTrigger value="evidence">Evidence Act</TabsTrigger>
        </TabsList>

        {Object.entries(legalData).map(([key, data]) => (
          <TabsContent key={key} value={key}>
            <div className="space-y-3">
              {filterSections(data.sections).map(s => (
                <Card key={s.section}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Section {s.section} — {s.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{s.summary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filterSections(data.sections).length === 0 && (
                <Card><CardContent className="py-8 text-center text-muted-foreground">No sections match your search.</CardContent></Card>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
