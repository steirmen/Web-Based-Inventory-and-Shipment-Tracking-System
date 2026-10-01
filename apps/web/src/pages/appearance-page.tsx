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
import { apiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useAppearance } from '@/lib/appearance/appearance-context';
import {
  DENSITY_LABELS,
  FONT_SCALE_LABELS,
  INTENSITY_LABELS,
  MODE_LABELS,
  RADIUS_LABELS,
  sameAppearance,
} from '@/lib/appearance/labels';

const MODE_ICONS = { light: <Sun aria-hidden="true" />, dark: <Moon aria-hidden="true" /> };

/**
 * Personal appearance settings (user-level: the same in every workspace).
 * Every change previews immediately; nothing is stored until Save. Cancel —
 * or leaving the page — returns to the saved appearance. Only how Nexora
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

  // The app always shows the draft (null = the saved appearance)…
  useEffect(() => preview(draft), [draft, preview]);
  // …and leaving the page ends any unsaved preview.
  useEffect(() => () => preview(null), [preview]);

  if (appearance.status === 'loading') return <LoadingState label="Loading your appearance" />;
  if (appearance.status === 'error' || !appearance.saved) {
    return (
      <ErrorState
        title="We couldn't load your appearance"
        error={appearance.error}
        onRetry={appearance.retry}
      />
    );
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
        setNotice('Appearance reset to the default.');
      },
    });

  return (
    <div className="flex flex-col gap-6 pb-4">
      <title>{pageTitle('Appearance')}</title>
      <PageHeader
        eyebrow="Your settings"
        title="Appearance"
        description="Personalize how Nexora looks for you, in every workspace. Changes preview instantly and are kept when you save."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {notice && (
            <Alert tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          <Section icon={Contrast} title="Mode" description="Light or dark interface.">
            <SegmentedControl
              label="Mode"
              value={value.mode}
              options={APPEARANCE_MODES.map((mode) => ({
                value: mode,
                label: MODE_LABELS[mode],
                icon: MODE_ICONS[mode],
              }))}
              onChange={(mode) => change({ mode })}
            />
          </Section>

          <Section
            icon={Palette}
            title="Theme"
            description="A complete color palette, shown here in the current mode."
          >
            <ThemePicker config={value} onChange={(theme) => change({ theme })} />
            {value.theme === 'custom' && (
              <div className="mt-5 border-t border-border pt-5">
                <CustomThemeEditor config={value} onChange={change} />
              </div>
            )}
          </Section>

          <Section
            icon={Sparkles}
            title="Background"
            description="A subtle animated background behind your pages. Content always stays on top."
          >
            <div className="flex flex-col gap-5">
              <EffectPicker
                value={value.backgroundEffect}
                onChange={(backgroundEffect) => change({ backgroundEffect })}
              />
              <Setting label="Animation">
                <SegmentedControl
                  label="Animation"
                  value={value.animationIntensity}
                  options={ANIMATION_INTENSITIES.map((intensity) => ({
                    value: intensity,
                    label: INTENSITY_LABELS[intensity],
                  }))}
                  onChange={(animationIntensity) => change({ animationIntensity })}
                />
              </Setting>
              {appearance.reducedMotion && (
                <Alert tone="info">
                  Your device asks for reduced motion, so background effects are shown as a still
                  image.
                </Alert>
              )}
            </div>
          </Section>

          <Section
            icon={SlidersHorizontal}
            title="Interface"
            description="Spacing, corners, and text size."
          >
            <div className="grid gap-5 lg:grid-cols-3">
              <Setting label="Density">
                <SegmentedControl
                  label="Density"
                  value={value.density}
                  options={DENSITIES.map((density) => ({
                    value: density,
                    label: DENSITY_LABELS[density],
                  }))}
                  onChange={(density) => change({ density })}
                />
              </Setting>
              <Setting label="Corners">
                <SegmentedControl
                  label="Corners"
                  value={value.radius}
                  options={RADII.map((radius) => ({ value: radius, label: RADIUS_LABELS[radius] }))}
                  onChange={(radius) => change({ radius })}
                />
              </Setting>
              <Setting label="Text size">
                <SegmentedControl
                  label="Text size"
                  value={value.fontScale}
                  options={FONT_SCALES.map((fontScale) => ({
                    value: fontScale,
                    label: FONT_SCALE_LABELS[fontScale],
                  }))}
                  onChange={(fontScale) => change({ fontScale })}
                />
              </Setting>
            </div>
          </Section>

          <Section
            icon={Bookmark}
            title="Saved profiles"
            description="Keep looks you like and switch between them. Profiles store appearance only."
          >
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
        <aside aria-label="Preview" className="hidden xl:sticky xl:top-20 xl:block">
          <AppearancePreview />
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <output className="text-sm text-muted-foreground" aria-live="polite">
            {dirty ? 'Unsaved changes — you are seeing a preview.' : 'All changes saved.'}
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
              Reset to default
            </Button>
            <Button variant="secondary" onClick={discard} disabled={!dirty || save.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                !save.isPending &&
                save.mutate(value, {
                  onSuccess: () => {
                    discard();
                    setNotice('Appearance saved.');
                  },
                })
              }
              disabled={!dirty}
              isLoading={save.isPending}
            >
              Save
            </Button>
          </div>
        </div>
        {save.isError && (
          <Alert tone="danger" className="mt-3">
            {apiErrorMessage(save.error)}
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset to default?"
        description="Your unsaved changes are discarded and the default Nexora appearance is saved. Saved profiles are kept."
        confirmLabel="Reset"
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
