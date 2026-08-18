-- Optional per-organization external data source for WAI.
ALTER TABLE "Organization" ADD COLUMN "dataSourceUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "enabledTables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
