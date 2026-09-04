-- Built-in ERP mode is removed: WAI only answers from an org's connected external database now.
-- AssistantToolSetting existed solely to toggle the built-in tools on/off.
DROP TABLE "AssistantToolSetting";
