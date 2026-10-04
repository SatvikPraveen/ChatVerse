import { ArrowLeft } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '@/lib/api';
import { conversationTitle } from '@/lib/conversation-title';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { api, getRuntime, logout, resetEncryptionKeys } from '@/lib/session';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useUiStore, type Theme } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toast = useUiStore((s) => s.toast);
  const conversations = useConversationsStore((s) => s.byId);
  const users = useUsersStore((s) => s.byId);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentPushSubscription().then((s) => setPushOn(s !== null));
  }, []);

  if (!user) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setUser(
        await api.users.updateMe({ displayName: displayName.trim(), bio: bio.trim() || null }),
      );
      toast('success', 'Profile saved');
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function updateSettings(patch: Parameters<typeof api.users.updateMe>[0]['settings']) {
    try {
      setUser(await api.users.updateMe({ settings: patch }));
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Could not save');
    }
  }

  async function togglePush() {
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        setPushOn(await enablePush());
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Push setup failed');
    }
  }

  async function resetKeys() {
    if (
      !confirm(
        'Reset encryption keys? Existing encrypted conversations will need new sessions and older messages may become unreadable on this device.',
      )
    )
      return;
    try {
      await resetEncryptionKeys();
      toast('success', 'New encryption keys published');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Reset failed');
    }
  }

  function exportSafetyNumbers() {
    const r = getRuntime();
    if (!r) return;
    const lines = Object.values(conversations)
      .filter((c) => c.kind === 'direct' && c.encrypted)
      .map((c) => {
        const peer = c.participants.find((p) => p.userId !== user!.id)?.userId;
        const sn = peer ? r.e2ee.safetyNumberWith(peer) : null;
        return `${conversationTitle(c, users, user!.id)}: ${sn ?? '(no session yet)'}`;
      });
    const blob = new Blob(
      [
        `ChatVerse safety numbers for ${user!.username} (device ${r.deviceId})\n\n${lines.join('\n')}\n`,
      ],
      { type: 'text/plain' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chatverse-safety-numbers.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const settings = user.settings;

  return (
    <div className="scrollbar-thin h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/app" className="btn-ghost p-2" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Profile</h2>
          <form className="mt-3 space-y-3" onSubmit={saveProfile}>
            <p className="text-xs text-muted">
              @{user.username} · {user.email}
            </p>
            <div>
              <label htmlFor="displayName" className="text-xs font-medium text-muted">
                Display name
              </label>
              <input
                id="displayName"
                className="input mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
              />
            </div>
            <div>
              <label htmlFor="bio" className="text-xs font-medium text-muted">
                Bio
              </label>
              <textarea
                id="bio"
                className="input mt-1"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={280}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              Save
            </button>
          </form>
        </section>

        <section className="card mt-4 p-4">
          <h2 className="text-sm font-semibold">Appearance</h2>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Theme">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                className={theme === t ? 'btn-primary' : 'btn-ghost border border-border'}
                onClick={() => {
                  setTheme(t);
                  void updateSettings({ theme: t });
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="card mt-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold">Notifications & privacy</h2>
          <label className="flex items-center justify-between text-sm">
            <span>Push notifications {pushSupported() ? '' : '(unavailable in this browser)'}</span>
            <input
              type="checkbox"
              checked={pushOn}
              disabled={!pushSupported()}
              onChange={() => void togglePush()}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Sound</span>
            <input
              type="checkbox"
              checked={settings.notifications.sound}
              onChange={(e) => void updateSettings({ notifications: { sound: e.target.checked } })}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Send read receipts</span>
            <input
              type="checkbox"
              checked={settings.privacy.readReceipts}
              onChange={(e) => void updateSettings({ privacy: { readReceipts: e.target.checked } })}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Show my online status</span>
            <input
              type="checkbox"
              checked={settings.privacy.showOnlineStatus}
              onChange={(e) =>
                void updateSettings({ privacy: { showOnlineStatus: e.target.checked } })
              }
            />
          </label>
        </section>

        <section className="card mt-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold">Encryption</h2>
          <p className="text-xs text-muted">
            Device <code className="font-mono">{getRuntime()?.deviceId}</code>. Private keys never
            leave this browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost border border-border"
              onClick={exportSafetyNumbers}
            >
              Export safety numbers
            </button>
            <button type="button" className="btn-danger" onClick={() => void resetKeys()}>
              Reset encryption keys
            </button>
          </div>
        </section>

        <section className="card mt-4 p-4">
          <button
            type="button"
            className="btn-ghost border border-border"
            onClick={() => void logout()}
          >
            Log out
          </button>
        </section>
      </div>
    </div>
  );
}
