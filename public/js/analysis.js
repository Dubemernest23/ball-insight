// Analysis Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    
    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Remove active class from all
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked
            this.classList.add('active');
            document.getElementById(`${tabName}-analysis`).classList.add('active');
        });
    });

    // Single Team Analysis Form
    const singleTeamForm = document.getElementById('singleTeamForm');
    if (singleTeamForm) {
        singleTeamForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const teamId = document.getElementById('team').value;
            const matches = document.getElementById('matches').value;
            const homeAway = document.getElementById('homeAway').value;
            
            if (!teamId) {
                alert('Please select a team');
                return;
            }
            
            // Show loading state
            showLoading();
            
            try {
                const response = await fetch(`/analysis/team/${teamId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ matches, homeAway })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    displayResults(data.analysis, teamId);
                } else {
                    showError(data.error || 'Analysis failed');
                }
            } catch (error) {
                console.error('Error:', error);
                showError('Failed to analyze team. Please try again.');
            }
        });
    }

    // Head-to-Head Form
    const h2hForm = document.getElementById('h2hForm');
    if (h2hForm) {
        h2hForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const team1Id = document.getElementById('team1').value;
            const team2Id = document.getElementById('team2').value;
            const matches = document.getElementById('h2hMatches').value;
            
            if (!team1Id || !team2Id) {
                alert('Please select both teams');
                return;
            }
            
            if (team1Id === team2Id) {
                alert('Please select different teams');
                return;
            }
            
            showLoading();
            
            try {
                const response = await fetch('/analysis/h2h', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ team1Id, team2Id, matches })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    displayH2HResults(data);
                } else {
                    showError(data.error || 'Analysis failed');
                }
            } catch (error) {
                console.error('Error:', error);
                showError('Failed to compare teams. Please try again.');
            }
        });
    }
});

// Show loading state
function showLoading() {
    const container = document.getElementById('results-container');
    container.style.display = 'block';
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Analyzing matches and crunching numbers...</p>
        </div>
    `;
    container.scrollIntoView({ behavior: 'smooth' });
    
    // Update button state
    const activeButton = document.querySelector('button[type="submit"]');
    const btnText = activeButton.querySelector('.btn-text');
    const btnLoader = activeButton.querySelector('.btn-loader');
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';
    activeButton.disabled = true;
}

// Reset button state
function resetButton() {
    const activeButton = document.querySelector('button[type="submit"]');
    if (activeButton) {
        const btnText = activeButton.querySelector('.btn-text');
        const btnLoader = activeButton.querySelector('.btn-loader');
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        activeButton.disabled = false;
    }
}

// Show error message
function showError(message) {
    const container = document.getElementById('results-container');
    container.style.display = 'block';
    container.innerHTML = `
        <div class="results-card" style="background: #fee; border-left: 4px solid #e74c3c;">
            <h3 style="color: #e74c3c;">❌ Error</h3>
            <p>${message}</p>
        </div>
    `;
    resetButton();
}

// Display single team results
function displayResults(analysis, teamId) {
    const container = document.getElementById('results-container');
    
    const html = `
        <div class="results-card">
            <div class="results-header">
                <div class="team-info">
                    <h2>Team Analysis Results</h2>
                    <p>Based on last ${analysis.matches_analyzed} matches</p>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="stats-grid">
                <div class="stat-box">
                    <h3>First to Score</h3>
                    <div class="stat-percentage ${getPercentageClass(analysis.first_to_score.percentage)}">
                        ${analysis.first_to_score.percentage}%
                    </div>
                    <p style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.9rem;">
                        ${analysis.first_to_score.count} of ${analysis.first_to_score.total} matches
                    </p>
                </div>

                <div class="stat-box">
                    <h3>Both Teams Score</h3>
                    <div class="stat-percentage ${getPercentageClass(analysis.btts.percentage)}">
                        ${analysis.btts.percentage}%
                    </div>
                    <p style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.9rem;">
                        ${analysis.btts.count} of ${analysis.btts.total} matches
                    </p>
                </div>

                <div class="stat-box">
                    <h3>Over 2.5 Goals</h3>
                    <div class="stat-percentage ${getPercentageClass(analysis.over_under.over_2_5.percentage)}">
                        ${analysis.over_under.over_2_5.percentage}%
                    </div>
                    <p style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.9rem;">
                        ${analysis.over_under.over_2_5.count} of ${analysis.over_under.over_2_5.total} matches
                    </p>
                </div>
            </div>

            <!-- Goal Timing Analysis -->
            <div class="timing-section">
                <h3>⏱️ Goal Timing Analysis</h3>
                <p style="color: #7f8c8d; margin-bottom: 1.5rem;">
                    When does this team typically score and concede goals?
                </p>
                
                <h4 style="color: #27ae60; margin-bottom: 1rem;">Goals Scored</h4>
                <div class="timing-bars">
                    ${generateTimingBars(analysis.goal_timing, 'scored')}
                </div>

                <h4 style="color: #e74c3c; margin: 2rem 0 1rem;">Goals Conceded</h4>
                <div class="timing-bars">
                    ${generateTimingBars(analysis.goal_timing, 'conceded')}
                </div>
            </div>

            <!-- Over/Under Analysis -->
            <div class="timing-section">
                <h3>📊 Over/Under Trends</h3>
                <div class="over-under-grid">
                    ${generateOverUnderBoxes(analysis.over_under)}
                </div>
            </div>

            <!-- Home/Away Performance -->
            <div class="timing-section">
                <h3>🏟️ Home vs Away Performance</h3>
                <div class="home-away-grid">
                    <div class="venue-box">
                        <h4>🏠 Home</h4>
                        <div class="record">
                            ${analysis.home_away.home.wins}W - 
                            ${analysis.home_away.home.draws}D - 
                            ${analysis.home_away.home.losses}L
                        </div>
                        <p style="text-align: center; color: #7f8c8d; margin-top: 0.5rem;">
                            ${analysis.home_away.home.total} matches
                        </p>
                    </div>
                    <div class="venue-box">
                        <h4>✈️ Away</h4>
                        <div class="record">
                            ${analysis.home_away.away.wins}W - 
                            ${analysis.home_away.away.draws}D - 
                            ${analysis.home_away.away.losses}L
                        </div>
                        <p style="text-align: center; color: #7f8c8d; margin-top: 0.5rem;">
                            ${analysis.home_away.away.total} matches
                        </p>
                    </div>
                </div>
            </div>

            <!-- Betting Insights -->
            ${generateInsights(analysis)}
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
    resetButton();
}

// Display head-to-head results
function displayH2HResults(data) {
    const container = document.getElementById('results-container');
    
    const html = `
        <div class="results-card">
            <h2 style="text-align: center; margin-bottom: 2rem;">Head-to-Head Comparison</h2>
            
            <!-- Team 1 Stats -->
            <h3>Team 1 Analysis</h3>
            ${generateQuickStats(data.team1)}
            
            <hr style="margin: 2rem 0; border: none; border-top: 2px solid #ecf0f1;">
            
            <!-- Team 2 Stats -->
            <h3>Team 2 Analysis</h3>
            ${generateQuickStats(data.team2)}
            
            <hr style="margin: 2rem 0; border: none; border-top: 2px solid #ecf0f1;">
            
            <!-- H2H History -->
            <h3>Recent Meetings</h3>
            <p style="color: #7f8c8d;">
                ${data.h2h.total_matches} matches found in database
            </p>
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
    resetButton();
}

// Generate timing bars HTML
function generateTimingBars(goalTiming, type) {
    const intervals = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
    
    return intervals.map(interval => {
        const data = goalTiming[interval];
        const value = data[type];
        const percentage = data[`${type}_percentage`];
        
        return `
            <div class="timing-row">
                <div class="timing-label">${interval} min</div>
                <div class="timing-bar-container">
                    <div class="timing-bar ${type}" style="width: ${percentage}%">
                        ${value} (${percentage}%)
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Generate over/under boxes
function generateOverUnderBoxes(overUnder) {
    const thresholds = ['0.5', '1.5', '2.5', '3.5', '4.5'];
    
    return thresholds.map(threshold => {
        const key = `over_${threshold}`;
        const data = overUnder[key];
        
        return `
            <div class="ou-box">
                <h4>Over ${threshold}</h4>
                <div class="ou-percentage ${getPercentageClass(data.percentage)}">
                    ${data.percentage}%
                </div>
                <p style="color: #7f8c8d; font-size: 0.85rem; margin-top: 0.5rem;">
                    ${data.count}/${data.total}
                </p>
            </div>
        `;
    }).join('');
}

// Generate betting insights
function generateInsights(analysis) {
    const insights = [];
    
    // First to score insight
    if (analysis.first_to_score.percentage >= 70) {
        insights.push({
            icon: '✅',
            text: `Strong bet: Team scores first (${analysis.first_to_score.percentage}% success rate)`
        });
    }
    
    // BTTS insight
    if (analysis.btts.percentage >= 60) {
        insights.push({
            icon: '⚽',
            text: `Good bet: Both teams to score (${analysis.btts.percentage}% of matches)`
        });
    } else if (analysis.btts.percentage <= 30) {
        insights.push({
            icon: '🚫',
            text: `Avoid: Both teams to score (Only ${analysis.btts.percentage}% of matches)`
        });
    }
    
    // Over 2.5 insight
    if (analysis.over_under.over_2_5.percentage >= 70) {
        insights.push({
            icon: '📈',
            text: `Strong bet: Over 2.5 goals (${analysis.over_under.over_2_5.percentage}% hit rate)`
        });
    } else if (analysis.over_under.over_2_5.percentage <= 30) {
        insights.push({
            icon: '📉',
            text: `Consider: Under 2.5 goals (${100 - analysis.over_under.over_2_5.percentage}% hit rate)`
        });
    }
    
    // Goal timing insight
    const earlyGoals = analysis.goal_timing['0-15'].scored_percentage + 
                       analysis.goal_timing['15-30'].scored_percentage;
    if (earlyGoals >= 50) {
        insights.push({
            icon: '⚡',
            text: `Team scores early! ${earlyGoals}% of goals in first 30 minutes`
        });
    }
    
    if (insights.length === 0) {
        insights.push({
            icon: '💡',
            text: 'Mixed results - bet carefully and consider other factors'
        });
    }
    
    return `
        <div class="insights-box">
            <h3>💡 Betting Insights</h3>
            <ul class="insights-list">
                ${insights.map(insight => `
                    <li>
                        <span class="insight-icon">${insight.icon}</span>
                        <span>${insight.text}</span>
                    </li>
                `).join('')}
            </ul>
            <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.9;">
                ⚠️ Always gamble responsibly. Past performance doesn't guarantee future results.
            </p>
        </div>
    `;
}

// Helper: Generate quick stats for H2H
function generateQuickStats(analysis) {
    return `
        <div class="stats-grid">
            <div class="stat-box">
                <h3>First to Score</h3>
                <div class="stat-percentage ${getPercentageClass(analysis.first_to_score.percentage)}">
                    ${analysis.first_to_score.percentage}%
                </div>
            </div>
            <div class="stat-box">
                <h3>BTTS</h3>
                <div class="stat-percentage ${getPercentageClass(analysis.btts.percentage)}">
                    ${analysis.btts.percentage}%
                </div>
            </div>
            <div class="stat-box">
                <h3>Over 2.5</h3>
                <div class="stat-percentage ${getPercentageClass(analysis.over_under.over_2_5.percentage)}">
                    ${analysis.over_under.over_2_5.percentage}%
                </div>
            </div>
        </div>
    `;
}

// Helper: Get color class based on percentage
function getPercentageClass(percentage) {
    if (percentage >= 70) return 'high';
    if (percentage >= 40) return 'medium';
    return 'low';
}
