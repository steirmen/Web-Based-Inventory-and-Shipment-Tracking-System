import {
  ANIMATION_INTENSITIES,
  APPEARANCE_MODES,
  type AppearanceConfig,
  DEFAULT_APPEARANCE,
  DENSITIES,
  FONT_SCALES,
  RADII,
} from '@app/shared';
import {
  Bookmark,
  Contrast,
  type LucideIcon,
  Moon,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { AppearancePreview } from '@/components/appearance/appearance-preview';
import { AppearanceProfiles } from '@/components/appearance/appearance-profiles';
import { CustomThemeEditor } from '@/components/appearance/custom-theme-editor';
import { EffectPicker } from '@/components/appearance/effect-picker';
import { ThemePicker } from '@/components/appearance/theme-picker';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/page-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useResetAppearance, useSaveAppearance } from '@/hooks/use-appearance';
import { useMessages } from '@/i18n/i18n-context';
import { appearance as appearanceMessages } from '@/i18n/messages/appearance';
import { common } from '@/i18n/messages/common';
import { useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useAppearance } from '@/lib/appearance/appearance-context';
import { sameAppearance } from '@/lib/appearance/labels';

const MODE_ICONS = { light: <Sun aria-hidden="true" />, dark: <Moon aria-hidden="true" /> };

/**
 * Personal appearance settings (user-level: the same in every workspace).
 * Every change previews immediately; nothing is stored until Save. Cancel —
 * or leaving the page — returns to the saved appearance. Only how the app
 * LOOKS can change here; navigation, pages, and workflows stay the same.
 */
export function AppearancePage() {
  const appearance = useAppearance();
  const save = useSaveAppearance();
  const reset = useResetAppearance();
  const [draft, setDraft] = useState<AppearanceConfig | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { preview } = appearance;
  const a = useMessages(appearanceMessages);
  const m = a.page;
  const c = useMessages(common);
  const errorMessage = useApiErrorMessage();

  // The app always shows the draft (null = the saved appearance)…
  useEffect(() => preview(draft), [draft, preview]);
  // …and leaving the page ends any unsaved preview.
  useEffect(() => () => preview(null), [preview]);

  if (appearance.status === 'loading') return <LoadingState label={m.loading} />;
  if (appearance.status === 'error' || !appearance.saved) {
    return <ErrorState title={m.loadError} error={appearance.error} onRetry={appearance.retry} />;
  }

  const saved = appearance.saved;
  const value = draft ?? saved;
  const dirty = !sameAppearance(value, saved);

  // Functional update: several changes before the next render all apply.
  const change = (patch: Partial<AppearanceConfig>) => {
    setDraft((current) => ({ ...(current ?? saved), ...patch }));
    setNotice(null);
  };
  const discard = () => setDraft(null);
  const doReset = () =>
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirmReset(false);
        discard();
        setNotice(m.resetDone);
      },
    });

  return (
    <div className="flex flex-col gap-6 pb-4">
      <title>{pageTitle(m.title)}</title>
      <PageHeader eyebrow={m.eyebrow} title={m.title} description={m.description} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {notice && (
            <Alert tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          <Section icon={Contrast} title={m.mode} description={m.modeText}>
            <SegmentedControl
              label={m.mode}
              value={value.mode}
              options={APPEARANCE_MODES.map((mode) => ({
                value: mode,
                label: c.modes[mode],
                icon: MODE_ICONS[mode],
              }))}
              onChange={(mode) => change({ mode })}
            />
          </Section>

          <Section icon={Palette} title={m.theme} description={m.themeText}>
            <ThemePicker config={value} onChange={(theme) => change({ theme })} />
            {value.theme === 'custom' && (
              <div className="mt-5 border-t border-border pt-5">
                <CustomThemeEditor config={value} onChange={change} />
              </div>
            )}
          </Section>

          <Section icon={Sparkles} title={m.background} description={m.backgroundText}>
            <div className="flex flex-col gap-5">
              <EffectPicker
                value={value.backgroundEffect}
                onChange={(backgroundEffect) => change({ backgroundEffect })}
              />
              <Setting label={m.animation}>
                <SegmentedControl
                  label={m.animation}
                  value={value.animationIntensity}
                  options={ANIMATION_INTENSITIES.map((intensity) => ({
                    value: intensity,
                    label: a.intensity[intensity],
                  }))}
                  onChange={(animationIntensity) => change({ animationIntensity })}
                />
              </Setting>
              {appearance.reducedMotion && <Alert tone="info">{m.reducedMotion}</Alert>}
            </div>
          </Section>

          <Section icon={SlidersHorizontal} title={m.interface} description={m.interfaceText}>
            <div className="grid gap-5 lg:grid-cols-3">
              <Setting label={m.density}>
                <SegmentedControl
                  label={m.density}
                  value={value.density}
                  options={DENSITIES.map((density) => ({
                    value: density,
                    label: a.density[density],
                  }))}
                  onChange={(density) => change({ density })}
                />
              </Setting>
              <Setting label={m.corners}>
                <SegmentedControl
                  label={m.corners}
                  value={value.radius}
                  options={RADII.map((radius) => ({ value: radius, label: a.radius[radius] }))}
                  onChange={(radius) => change({ radius })}
                />
              </Setting>
              <Setting label={m.textSize}>
                <SegmentedControl
                  label={m.textSize}
                  value={value.fontScale}
                  options={FONT_SCALES.map((fontScale) => ({
                    value: fontScale,
                    label: a.fontScale[fontScale],
                  }))}
                  onChange={(fontScale) => change({ fontScale })}
                />
              </Setting>
            </div>
          </Section>

          <Section icon={Bookmark} title={m.profiles} description={m.profilesText}>
            <AppearanceProfiles
              current={value}
              saved={saved}
              onApplied={() => {
                discard();
                setNotice(null);
              }}
            />
          </Section>
        </div>
        {/* The whole app previews the draft; this sample shows it next to the controls. */}
        <aside aria-label={m.preview} className="hidden xl:sticky xl:top-20 xl:block">
          <AppearancePreview />
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <output className="text-sm text-muted-foreground" aria-live="polite">
            {dirty ? m.dirty : m.clean}
          </output>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => (dirty ? setConfirmReset(true) : doReset())}
              disabled={
                reset.isPending ||
                save.isPending ||
                (!dirty && sameAppearance(saved, DEFAULT_APPEARANCE))
              }
            >
              <RotateCcw aria-hidden="true" />
              {m.reset}
            </Button>
            <Button variant="secondary" onClick={discard} disabled={!dirty || save.isPending}>
              {m.cancel}
            </Button>
            <Button
              onClick={() =>
                !save.isPending &&
                save.mutate(value, {
                  onSuccess: () => {
                    discard();
                    setNotice(m.saved);
                  },
                })
              }
              disabled={!dirty}
              isLoading={save.isPending}
            >
              {m.save}
            </Button>
          </div>
        </div>
        {save.isError && (
          <Alert tone="danger" className="mt-3">
            {errorMessage(save.error)}
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={m.resetTitle}
        description={m.resetText}
        confirmLabel={m.resetConfirm}
        tone="danger"
        pending={reset.isPending}
        error={reset.error}
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}
