import { getMessages } from '@/lib/messages';
import { createMessage, togglePin, deleteMessage } from '@/lib/messages-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Pin, Trash2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  const messages = await getMessages();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Message Board</h1>
        <p className="text-muted-foreground mt-1">
          Post announcements the whole crew sees on their dashboard
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
          <CardDescription>Keep it short. Line breaks are preserved.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createMessage} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="e.g. Schedule change for Friday" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <textarea
                id="body"
                name="body"
                required
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Write your announcement…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pinned" className="h-4 w-4" />
              Pin to top
            </label>
            <Button type="submit">Post</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posted</CardTitle>
          <CardDescription>
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No messages yet.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{m.title}</span>
                        {m.pinned && (
                          <Badge variant="secondary" className="text-xs">
                            Pinned
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {m.body}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-2">
                        {m.author_name} · {format(new Date(m.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <form action={togglePin.bind(null, m.id, !m.pinned)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          aria-label={m.pinned ? 'Unpin' : 'Pin'}
                          title={m.pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className={`h-4 w-4 ${m.pinned ? 'text-primary' : ''}`} />
                        </Button>
                      </form>
                      <form action={deleteMessage.bind(null, m.id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
