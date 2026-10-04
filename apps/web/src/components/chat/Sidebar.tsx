import { LogOut, MessageSquarePlus, Search, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { conversationTitle } from '@/lib/conversation-title';
import { logout } from '@/lib/session';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useUsersStore } from '@/stores/users';
import { Avatar } from '../ui/Avatar';
import { ConversationItem } from './ConversationItem';
import { NewChatDialog } from './NewChatDialog';

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const byId = useConversationsStore((s) => s.byId);
  const order = useConversationsStore((s) => s.order);
  const loaded = useConversationsStore((s) => s.loaded);
  const users = useUsersStore((s) => s.byId);
  const [filter, setFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = order.map((id) => byId[id]!);
    if (!q || !user) return list;
    return list.filter((c) => conversationTitle(c, users, user.id).toLowerCase().includes(q));
  }, [order, byId, filter, users, user]);

  if (!user) return null;

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface md:w-80" aria-label="Conversations">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Link to="/app/settings" className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2" title="Settings">
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
          <span className="truncate text-sm font-medium">{user.displayName}</span>
        </Link>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-ghost p-2" onClick={() => setDialogOpen(true)} aria-label="New conversation">
            <MessageSquarePlus size={18} />
          </button>
          <Link to="/app/settings" className="btn-ghost p-2" aria-label="Settings">
            <Settings size={18} />
          </Link>
          <button type="button" className="btn-ghost p-2" onClick={() => void logout()} aria-label="Log out">
            <LogOut size={18} />
          </button>
        </span>
      </div>
      <div className="px-3 py-2">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-muted" />
          <input
            className="input pl-8"
            placeholder="Search conversations"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Search conversations"
          />
        </label>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {!loaded && <p className="px-3 py-6 text-center text-xs text-muted">Loading…</p>}
        {loaded && visible.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {filter ? 'No matches.' : 'No conversations yet. Start one with the + button.'}
          </p>
        )}
        <ul className="space-y-0.5">
          {visible.map((c) => (
            <li key={c.id}>
              <ConversationItem conversation={c} myUserId={user.id} />
            </li>
          ))}
        </ul>
      </nav>
      <NewChatDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </aside>
  );
}
