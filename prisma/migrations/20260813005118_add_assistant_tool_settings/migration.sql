-- CreateTable
CREATE TABLE "AssistantToolSetting" (
    "toolName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantToolSetting_pkey" PRIMARY KEY ("toolName")
);
