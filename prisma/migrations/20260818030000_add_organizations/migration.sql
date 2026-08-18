-- Multi-tenant support: introduce Organization and backfill all existing
-- rows into a single default org, so this migration is safe to run against
-- a database that already has real data (no downtime, no manual steps).

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Organization" ("id", "name", "createdAt")
VALUES ('org_digitalize_default', 'Digitalize', CURRENT_TIMESTAMP);

-- User
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
UPDATE "User" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Staff
ALTER TABLE "Staff" ADD COLUMN "organizationId" TEXT;
UPDATE "Staff" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Staff" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Staff_organizationId_idx" ON "Staff"("organizationId");

-- Client
ALTER TABLE "Client" ADD COLUMN "organizationId" TEXT;
UPDATE "Client" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Client" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");

-- Lead
ALTER TABLE "Lead" ADD COLUMN "organizationId" TEXT;
UPDATE "Lead" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Lead" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");

-- Project
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;
UPDATE "Project" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- Invoice
ALTER TABLE "Invoice" ADD COLUMN "organizationId" TEXT;
UPDATE "Invoice" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Invoice" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Invoice_organizationId_idx" ON "Invoice"("organizationId");

-- Expense
ALTER TABLE "Expense" ADD COLUMN "organizationId" TEXT;
UPDATE "Expense" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "Expense" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Expense_organizationId_idx" ON "Expense"("organizationId");

-- ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "organizationId" TEXT;
UPDATE "ApiKey" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "ApiKey" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN "organizationId" TEXT;
UPDATE "ActivityLog" SET "organizationId" = 'org_digitalize_default';
ALTER TABLE "ActivityLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "ActivityLog_category_createdAt_idx";
CREATE INDEX "ActivityLog_organizationId_category_createdAt_idx" ON "ActivityLog"("organizationId", "category", "createdAt");
