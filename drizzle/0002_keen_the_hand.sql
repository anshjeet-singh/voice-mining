-- Alter reports table: add new columns, drop old ones
ALTER TABLE `reports`
  ADD COLUMN `talkingHeadScripts` json NOT NULL DEFAULT ('[]'),
  ADD COLUMN `emailSequence` json NOT NULL DEFAULT ('{}');

ALTER TABLE `reports`
  DROP COLUMN `contentCalendar`,
  DROP COLUMN `keywordIntelligence`,
  DROP COLUMN `audiencePsychology`;