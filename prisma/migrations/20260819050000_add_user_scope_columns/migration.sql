-- Per-table user-scoping config for external data sources.
ALTER TABLE "Organization" ADD COLUMN "userScopeColumns" JSONB NOT NULL DEFAULT '{}';
