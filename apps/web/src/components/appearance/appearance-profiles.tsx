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
import { apiErrorMessage } from '@/lib/api-errors';
import { describeAppearance, sameAppearance } from '@/lib/appearance/labels';
import { themePreview } from '@/lib/appearance/themes';

const L = APPEARANCE_LIMITS;

const validName = (name: string) => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > L.profileNameMaxLength) {
    return `Use at most ${L.profileNameMaxLength} characters.`;
  }
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

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const error = validName(name);
    setNameError(error);
    setNotice(null);
    if (error) return;
    create.mutate(
      { name: name.trim().replace(/\s+/g, ' '), appearance: current },
      {
        onSuccess: ({ profile }) => {
          setName('');
          setNotice(`Saved “${profile.name}”.`);
        },
        onError: (failure) => setNameError(apiErrorMessage(failure)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <form noValidate onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <FormField
          label="Profile name"
          error={nameError}
          hint={
            full
              ? `You have ${L.profilesMax} profiles, the maximum. Delete one to save another.`
              : 'Saves the look you see now, e.g. “Night work” or “Presentation”.'
          }
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
          Save current look
        </Button>
      </form>

      {notice && <Alert tone="success">{notice}</Alert>}
      {apply.isError && <Alert tone="danger">{apiErrorMessage(apply.error)}</Alert>}

      {profiles.isPending && <LoadingState label="Loading profiles" />}
      {profiles.isError && (
        <ErrorState
          title="We couldn't load your profiles"
          error={profiles.error}
          onRetry={() => void profiles.refetch()}
        />
      )}
      {profiles.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<Bookmark className="size-5" aria-hidden="true" />}
          title="No saved profiles yet"
          description="Save a look to switch back to it in one click."
        />
      )}
      {list.length > 0 && (
        <ul
          className="divide-y divide-border rounded-control border border-border"
          aria-label="Saved profiles"
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
                    {describeAppearance(profile.appearance)}
                  </p>
                </div>
                <div className="flex w-full items-center gap-1 sm:w-auto">
                  {active ? (
                    <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
                      <Check className="size-3.5" aria-hidden="true" />
                      In use
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
                            setNotice(`Applied “${profile.name}”.`);
                            onApplied(profile);
                          },
                        });
                      }}
                      aria-label={`Apply ${profile.name}`}
                    >
                      Apply
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 px-0"
                    onClick={() => setRenaming(profile)}
                    aria-label={`Rename ${profile.name}`}
                    title="Rename"
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 px-0"
                    onClick={() => {
                      remove.reset();
                      setDeleting(profile);
                    }}
                    aria-label={`Delete ${profile.name}`}
                    title="Delete"
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
          setNotice(`Renamed to “${renamed}”.`);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete profile?"
        description={
          <>
            <span className="font-medium text-foreground">{deleting?.name}</span> is removed. Your
            current appearance does not change.
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setNotice(`Deleted “${deleting.name}”.`);
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
  return (
    <Dialog open={profile !== null} onClose={onClose} title="Rename profile">
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const validation = validName(name);
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
        onError: (failure) => setError(apiErrorMessage(failure)),
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormField label="Name" error={error}>
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
          Cancel
        </Button>
        <Button type="submit" isLoading={update.isPending}>
          Rename
        </Button>
      </div>
    </form>
  );
}
