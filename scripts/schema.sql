-- Football Analytics Database Schema

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10),
    country VARCHAR(100),
    logo VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    season INT NOT NULL,
    logo VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Matches/Fixtures table
CREATE TABLE IF NOT EXISTS matches (
    id INT PRIMARY KEY,
    league_id INT,
    season INT NOT NULL,
    match_date DATETIME NOT NULL,
    home_team_id INT NOT NULL,
    away_team_id INT NOT NULL,
    home_score INT,
    away_score INT,
    halftime_home_score INT,
    halftime_away_score INT,
    status VARCHAR(50),
    venue VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (home_team_id) REFERENCES teams(id),
    FOREIGN KEY (away_team_id) REFERENCES teams(id),
    INDEX idx_match_date (match_date),
    INDEX idx_teams (home_team_id, away_team_id)
);

-- Match Events table (goals, cards, substitutions)
CREATE TABLE IF NOT EXISTS match_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    match_id INT NOT NULL,
    team_id INT NOT NULL,
    player_name VARCHAR(255),
    event_type ENUM('Goal', 'Card', 'Substitution', 'Var') NOT NULL,
    event_detail VARCHAR(100),
    time_elapsed INT NOT NULL,
    time_extra INT DEFAULT 0,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    INDEX idx_match_events (match_id, event_type),
    INDEX idx_time (time_elapsed)
);

-- Match Statistics table
CREATE TABLE IF NOT EXISTS match_statistics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    match_id INT NOT NULL,
    team_id INT NOT NULL,
    shots_on_goal INT DEFAULT 0,
    shots_off_goal INT DEFAULT 0,
    total_shots INT DEFAULT 0,
    blocked_shots INT DEFAULT 0,
    shots_inside_box INT DEFAULT 0,
    shots_outside_box INT DEFAULT 0,
    fouls INT DEFAULT 0,
    corner_kicks INT DEFAULT 0,
    offsides INT DEFAULT 0,
    ball_possession INT DEFAULT 0,
    yellow_cards INT DEFAULT 0,
    red_cards INT DEFAULT 0,
    goalkeeper_saves INT DEFAULT 0,
    total_passes INT DEFAULT 0,
    passes_accurate INT DEFAULT 0,
    passes_percentage INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    INDEX idx_match_stats (match_id)
);

-- Analysis Cache table (to store computed analytics)
CREATE TABLE IF NOT EXISTS analysis_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    analysis_type VARCHAR(100) NOT NULL,
    time_period VARCHAR(50),
    home_away ENUM('home', 'away', 'both') DEFAULT 'both',
    data JSON NOT NULL,
    matches_analyzed INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    INDEX idx_cache_lookup (team_id, analysis_type, time_period)
);
