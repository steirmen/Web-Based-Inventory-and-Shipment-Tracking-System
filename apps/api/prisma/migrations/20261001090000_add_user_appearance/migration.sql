-- CreateTable
CREATE TABLE "user_appearances" (
    "user_id" UUID NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "theme" VARCHAR(32) NOT NULL,
    "custom_accent" VARCHAR(7) NOT NULL,
    "custom_tone" VARCHAR(16) NOT NULL,
    "background_effect" VARCHAR(32) NOT NULL,
    "animation_intensity" VARCHAR(16) NOT NULL,
    "density" VARCHAR(16) NOT NULL,
    "radius" VARCHAR(16) NOT NULL,
    "font_scale" VARCHAR(16) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_appearances_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "appearance_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "theme" VARCHAR(32) NOT NULL,
    "custom_accent" VARCHAR(7) NOT NULL,
    "custom_tone" VARCHAR(16) NOT NULL,
    "background_effect" VARCHAR(32) NOT NULL,
    "animation_intensity" VARCHAR(16) NOT NULL,
    "density" VARCHAR(16) NOT NULL,
    "radius" VARCHAR(16) NOT NULL,
    "font_scale" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appearance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appearance_profiles_user_id_created_at_idx" ON "appearance_profiles"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_appearances" ADD CONSTRAINT "user_appearances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appearance_profiles" ADD CONSTRAINT "appearance_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (not expressible in Prisma): only the identifiers @app/shared defines.
ALTER TABLE "user_appearances"
  ADD CONSTRAINT "user_appearances_mode_check" CHECK ("mode" IN ('light', 'dark')),
  ADD CONSTRAINT "user_appearances_theme_check" CHECK ("theme" IN ('default', 'ocean', 'forest', 'sunset', 'graphite', 'plum', 'paper', 'mint', 'lavender', 'rose', 'custom')),
  ADD CONSTRAINT "user_appearances_custom_tone_check" CHECK ("custom_tone" IN ('neutral', 'warm', 'cool')),
  ADD CONSTRAINT "user_appearances_background_effect_check" CHECK ("background_effect" IN ('none', 'rain', 'snow', 'fireflies', 'starry-night', 'autumn-leaves', 'cherry-blossoms', 'soft-lights', 'aurora')),
  ADD CONSTRAINT "user_appearances_animation_intensity_check" CHECK ("animation_intensity" IN ('low', 'medium', 'high')),
  ADD CONSTRAINT "user_appearances_density_check" CHECK ("density" IN ('compact', 'comfortable', 'spacious')),
  ADD CONSTRAINT "user_appearances_radius_check" CHECK ("radius" IN ('sharp', 'medium', 'round')),
  ADD CONSTRAINT "user_appearances_font_scale_check" CHECK ("font_scale" IN ('small', 'default', 'large')),
  ADD CONSTRAINT "user_appearances_custom_accent_check" CHECK ("custom_accent" ~ '^#[0-9a-f]{6}$');
ALTER TABLE "appearance_profiles"
  ADD CONSTRAINT "appearance_profiles_mode_check" CHECK ("mode" IN ('light', 'dark')),
  ADD CONSTRAINT "appearance_profiles_theme_check" CHECK ("theme" IN ('default', 'ocean', 'forest', 'sunset', 'graphite', 'plum', 'paper', 'mint', 'lavender', 'rose', 'custom')),
  ADD CONSTRAINT "appearance_profiles_custom_tone_check" CHECK ("custom_tone" IN ('neutral', 'warm', 'cool')),
  ADD CONSTRAINT "appearance_profiles_background_effect_check" CHECK ("background_effect" IN ('none', 'rain', 'snow', 'fireflies', 'starry-night', 'autumn-leaves', 'cherry-blossoms', 'soft-lights', 'aurora')),
  ADD CONSTRAINT "appearance_profiles_animation_intensity_check" CHECK ("animation_intensity" IN ('low', 'medium', 'high')),
  ADD CONSTRAINT "appearance_profiles_density_check" CHECK ("density" IN ('compact', 'comfortable', 'spacious')),
  ADD CONSTRAINT "appearance_profiles_radius_check" CHECK ("radius" IN ('sharp', 'medium', 'round')),
  ADD CONSTRAINT "appearance_profiles_font_scale_check" CHECK ("font_scale" IN ('small', 'default', 'large')),
  ADD CONSTRAINT "appearance_profiles_custom_accent_check" CHECK ("custom_accent" ~ '^#[0-9a-f]{6}$'),
  ADD CONSTRAINT "appearance_profiles_name_not_blank_check" CHECK (btrim("name") <> '');

-- Profile names are unique per user, case-insensitively ("Office" = "office").
CREATE UNIQUE INDEX "appearance_profiles_user_id_lower_name_key" ON "appearance_profiles" ("user_id", lower("name"));
