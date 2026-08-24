-- Platform-wide API keys: caller passes organizationId per request instead of the key being locked to one org.
ALTER TABLE "ApiKey" ADD COLUMN "isPlatformKey" BOOLEAN NOT NULL DEFAULT false;
