'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Target, ClipboardList } from 'lucide-react';
import {
  addRequirement,
  deleteRequirement,
  addSurvey,
  updateSurvey,
  deleteSurvey,
  addQuestion,
  deleteQuestion,
} from '@/lib/certification-actions';
import type { Requirement, SurveyQuestion } from '@/lib/certifications';

const QTYPE_LABEL: Record<string, string> = { rating: 'Rating 1–5', yes_no: 'Yes / No', text: 'Comment' };

export function RequirementsEditor({ skillId, requirements }: { skillId: string; requirements: Requirement[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('5');

  function add() {
    if (!label.trim()) return toast.error('Add a label');
    start(async () => {
      const res = await addRequirement(skillId, label, target);
      if (res.ok) {
        toast.success('Requirement added');
        setLabel('');
        setTarget('5');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await deleteRequirement(id);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? 'Could not remove');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" /> Practice requirements
        </CardTitle>
        <CardDescription>Milestones a candidate logs toward this certification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requirements.length > 0 ? (
          <ul className="divide-y">
            {requirements.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">{r.label}</span>
                <Badge variant="secondary">target {r.target_count}</Badge>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)} disabled={pending}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No requirements yet.</p>
        )}
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div className="space-y-1.5 flex-1 min-w-[12rem]">
            <Label>Requirement</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Designated stacker on a job" />
          </div>
          <div className="space-y-1.5 w-24">
            <Label>Target</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" />
          </div>
          <Button onClick={add} disabled={pending}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface SurveyWithQuestions {
  id: string;
  title: string;
  is_active: boolean;
  questions: SurveyQuestion[];
}

export function SurveysEditor({ skillId, surveys }: { skillId: string; surveys: SurveyWithQuestions[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');

  function add() {
    if (!title.trim()) return toast.error('Add a title');
    start(async () => {
      const res = await addSurvey(skillId, title);
      if (res.ok) {
        toast.success('Survey added');
        setTitle('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Crew-vote surveys
        </CardTitle>
        <CardDescription>Multi-question surveys the crew fill out when they scan the QR.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {surveys.length === 0 && <p className="text-sm text-muted-foreground">No surveys yet.</p>}
        {surveys.map((s) => (
          <SurveyRow key={s.id} survey={s} pending={pending} start={start} refresh={() => router.refresh()} />
        ))}
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div className="space-y-1.5 flex-1 min-w-[12rem]">
            <Label>New survey title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stacker certification vote" />
          </div>
          <Button onClick={add} disabled={pending}>
            Add survey
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SurveyRow({
  survey,
  pending,
  start,
  refresh,
}: {
  survey: SurveyWithQuestions;
  pending: boolean;
  start: (fn: () => void) => void;
  refresh: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState('rating');

  function addQ() {
    if (!prompt.trim()) return toast.error('Add a question');
    start(async () => {
      const res = await addQuestion(survey.id, prompt, type);
      if (res.ok) {
        setPrompt('');
        refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }
  function removeQ(id: string) {
    start(async () => {
      const res = await deleteQuestion(id);
      if (res.ok) refresh();
      else toast.error(res.error ?? 'Could not remove');
    });
  }
  function toggleActive() {
    start(async () => {
      const res = await updateSurvey(survey.id, survey.title, !survey.is_active);
      if (res.ok) refresh();
      else toast.error(res.error ?? 'Could not update');
    });
  }
  function removeSurvey() {
    if (!window.confirm(`Delete survey "${survey.title}"?`)) return;
    start(async () => {
      const res = await deleteSurvey(survey.id);
      if (res.ok) refresh();
      else toast.error(res.error ?? 'Could not delete');
    });
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium flex-1">{survey.title}</span>
        {!survey.is_active && <Badge variant="secondary">Inactive</Badge>}
        <Button variant="outline" size="sm" onClick={toggleActive} disabled={pending}>
          {survey.is_active ? 'Deactivate' : 'Activate'}
        </Button>
        <Button variant="ghost" size="sm" onClick={removeSurvey} disabled={pending}>
          Delete
        </Button>
      </div>
      {survey.questions.length > 0 ? (
        <ol className="space-y-1 text-sm list-decimal ml-5">
          {survey.questions.map((q) => (
            <li key={q.id} className="flex items-center gap-2">
              <span className="flex-1">{q.prompt}</span>
              <Badge variant="outline" className="text-xs">{QTYPE_LABEL[q.type]}</Badge>
              <Button variant="ghost" size="sm" onClick={() => removeQ(q.id)} disabled={pending}>
                ✕
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">No questions yet — add at least one.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Question prompt"
          className="flex-1 min-w-[10rem]"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">Rating 1–5</SelectItem>
            <SelectItem value="yes_no">Yes / No</SelectItem>
            <SelectItem value="text">Comment</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={addQ} disabled={pending}>
          Add question
        </Button>
      </div>
    </div>
  );
}
