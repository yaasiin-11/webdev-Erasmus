-- Migration 001: Add maximum capacity to study groups
ALTER TABLE study_groups ADD COLUMN max_capacity INTEGER DEFAULT 10;
