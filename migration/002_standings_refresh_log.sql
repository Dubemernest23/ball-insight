-- ============================================================
-- Migration: Add refresh_log and standings tables
-- Run this once:  mysql -u <user> -p ballinsightdb < migration_refresh.sql
-- ============================================================

-- Standings table (stores league table positions per season)
CREATE TABLE IF NOT EXISTS standings (
  id               INT          NOT NULL AUTO_INCREMENT,
  league_id        INT          NOT NULL,
  season           INT          NOT NULL,
  team_id          INT          NOT NULL,
  position         INT          NOT NULL DEFAULT 0,
  played           INT          NOT NULL DEFAULT 0,
  won              INT          NOT NULL DEFAULT 0,
  drawn            INT          NOT NULL DEFAULT 0,
  lost             INT          NOT NULL DEFAULT 0,
  goals_for        INT          NOT NULL DEFAULT 0,
  goals_against    INT          NOT NULL DEFAULT 0,
  goal_difference  INT          NOT NULL DEFAULT 0,
  points           INT          NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_standings (league_id, season, team_id),
  CONSTRAINT standings_ibfk_1 FOREIGN KEY (league_id) REFERENCES leagues (id),
  CONSTRAINT standings_ibfk_2 FOREIGN KEY (team_id)   REFERENCES teams   (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Refresh log table (audit trail for every cron run)
CREATE TABLE IF NOT EXISTS refresh_log (
  id                INT           NOT NULL AUTO_INCREMENT,
  status            ENUM('success','failed') NOT NULL DEFAULT 'success',
  matches_updated   INT           NOT NULL DEFAULT 0,
  standings_updated INT           NOT NULL DEFAULT 0,
  error_message     TEXT          NULL,
  ran_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
