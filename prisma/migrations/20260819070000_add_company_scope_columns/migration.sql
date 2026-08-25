-- Company-level scoping, alongside the existing per-user scoping.
ALTER TABLE "Organization" ADD COLUMN "companyScopeColumns" JSONB NOT NULL DEFAULT '{}';
