import { APPEARANCE_LIMITS, type AppearanceConfig, type AppearanceProfile } from '@app/shared';
import { Bookmark, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  useAppearanceProfiles,
  useApplyAppearanceProfile,
  useCreateAppearanceProfile,
  useDeleteAppearanceProfile,
  useUpdateAppearanceProfile,
} from '@/hooks/use-appearance';
import type { Translation } from '@/i18n/define';
import { useMessages } from '@/i18n/i18n-context';
import { appearance } from '@/i18n/messages/appearance';
import { common } from '@/i18n/messages/common';
import { useApiErrorMessage } from '@/lib/api-errors';
import { describeAppearance, sameAppearance } from '@/lib/appearance/labels';
import { themePreview } from '@/lib/appearance/themes';

const L = APPEARANCE_LIMITS;

type ProfileMessages = Translation<(typeof appearance)['en']>['profiles'];

const validName = (name: string, m: ProfileMessages) => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return m.nameRequired;
  if (trimmed.length > L.profileNameMaxLength) return m.nameTooLong;
  return undefined;
};

/**
 * Saved appearance profiles: named snapshots of the appearance settings only
 * (never organizations, pages, or business data). Applying one makes it the
 * saved appearance right away.
 */
export function AppearanceProfiles({
  current,
  saved,
  onApplied,
}: {
  /** The appearance being edited (what "Save current look" stores). */
  current: AppearanceConfig;
  saved: AppearanceConfig;
  onApplied: (profile: AppearanceProfile) => void;
}) {
  const profiles = useAppearanceProfiles();
  const create = useCreateAppearanceProfile();
  const apply = useApplyAppearanceProfile();
  const remove = useDeleteAppearanceProfile();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [renaming, setRenaming] = useState<AppearanceProfile | null>(null);
  const [deleting, setDeleting] = useState<AppearanceProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = profiles.data?.profiles ?? [];
  const full = list.length >= L.profilesMax;
  const a = useMessages(appearance);
  const c = useMessages(common);
  const m = a.profiles;
  const errorMessage = useApiErrorMessage();
  const names = {
    modes: c.modes,
    themes: c.themes.names,
    effects: a.effects.names,
    density: a.density,
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const error = validName(name, m);
    setNameError(error);
    setNotice(null);
    if (error) return;
    create.mutate(
      { name: name.trim().replace(/\s+/g, ' '), appearance: current },
      {
        onSuccess: ({ profile }) => {
          setName('');
          setNotice(m.saved({ name: profile.name }));
        },
        onError: (failure) => setNameError(errorMessage(failure)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <form noValidate onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <FormField
          label={m.name}
          error={nameError}
          hint={full ? m.full : m.hint}
          className="sm:flex-1"
        >
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={L.profileNameMaxLength}
              autoComplete="off"
              disabled={full}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="secondary"
          isLoading={create.isPending}
          disabled={full}
          className="sm:mt-6.5"
        >
          <Plus aria-hidden="true" />
          {m.saveCurrent}
        </Button>
      </form>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {apply.isError && <Alert tone="danger">{errorMessage(apply.error)}</Alert>}

      {profiles.isPending && <LoadingState label={m.loading} />}
      {profiles.isError && (
        <ErrorState
          title={m.loadError}
          error={profiles.error}
          onRetry={() => void profiles.refetch()}
        />
      )}
      {profiles.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<Bookmark className="size-5" aria-hidden="true" />}
          title={m.empty}
          description={m.emptyText}
        />
      )}
      {list.length > 0 && (
        <ul
          className="divide-y divide-border rounded-control border border-border"
          aria-label={m.list}
        >
          {list.map((profile) => {
            const colors = themePreview(profile.appearance.theme, profile.appearance);
            const active = sameAppearance(profile.appearance, saved);
            return (
              <li key={profile.id} className="flex flex-wrap items-center gap-3 p-3">
                <span
                  className="flex size-10 shrink-0 items-end justify-end rounded-control border border-border p-1"
                  style={{ background: colors.background }}
                  aria-hidden="true"
                >
                  <span className="size-4 rounded-sm" style={{ background: colors.accent }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{profile.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {describeAppearance(profile.appearance, names)}
                  </p>
                </div>
                <div className="flex w-full items-center gap-1 sm:w-auto">
                  {active ? (
                    <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
                      <Check className="size-3.5" aria-hidden="true" />
                      {m.inUse}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={apply.isPending && apply.variables === profile.id}
                      onClick={() => {
                        setNotice(null);
                        apply.mutate(profile.id, {
                          onSuccess: () => {
                            setNotice(m.applied({ name: profile.name }));
                            onApplied(profile);
                          },
                        });
                      }}
                      aria-label={m.applyNamed({ name: profile.name })}
                    >
                      {m.apply}
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setRenaming(profile)}
                    aria-label={m.renameNamed({ name: profile.name })}
                    title={m.rename}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      remove.reset();
                      setDeleting(profile);
                    }}
                    aria-label={m.deleteNamed({ name: profile.name })}
                    title={m.delete}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RenameDialog
        profile={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={(renamed) => {
          setRenaming(null);
          setNotice(m.renamed({ name: renamed }));
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={m.deleteTitle}
        description={
          <>
            <span className="font-medium text-foreground">{deleting?.name}</span> {m.deleteText}
          </>
        }
        confirmLabel={m.delete}
        tone="danger"
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setNotice(m.deleted({ name: deleting.name }));
              setDeleting(null);
            },
          })
        }
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function RenameDialog({
  profile,
  onClose,
  onRenamed,
}: {
  profile: AppearanceProfile | null;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const m = useMessages(appearance).profiles;
  return (
    <Dialog open={profile !== null} onClose={onClose} title={m.renameTitle}>
      {profile && (
        <RenameForm key={profile.id} profile={profile} onCancel={onClose} onRenamed={onRenamed} />
      )}
    </Dialog>
  );
}

function RenameForm({
  profile,
  onCancel,
  onRenamed,
}: {
  profile: AppearanceProfile;
  onCancel: () => void;
  onRenamed: (name: string) => void;
}) {
  const update = useUpdateAppearanceProfile();
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState<string | undefined>();
  const m = useMessages(appearance).profiles;
  const errorMessage = useApiErrorMessage();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const validation = validName(name, m);
    setError(validation);
    if (validation) return;
    const next = name.trim().replace(/\s+/g, ' ');
    if (next === profile.name) {
      onCancel();
      return;
    }
    update.mutate(
      { profileId: profile.id, body: { name: next } },
      {
        onSuccess: ({ profile: renamed }) => onRenamed(renamed.name),
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={m.renameName} error={error}>
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={L.profileNameMaxLength}
            autoComplete="off"
            data-autofocus
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        )}
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={update.isPending}>
          {m.cancel}
        </Button>
        <Button type="submit" isLoading={update.isPending}>
          {m.rename}
        </Button>
      </div>
    </form>
  );
}
