document.addEventListener('DOMContentLoaded', () => {
    const resultsContainer = document.getElementById('results-container');
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const standingsContainer = document.getElementById('standings-container');
    const standingsPlaceholder = document.getElementById('standings-placeholder');
    const loadStandingsBtn = document.getElementById('loadStandingsBtn');
    const analysisLeagueSelect = document.getElementById('analysisLeague');
    const singleTeamForm = document.getElementById('singleTeamForm');
    const h2hForm = document.getElementById('h2hForm');
    const tabButtons = document.querySelectorAll('.analysis-tab-btn');
    const panels = document.querySelectorAll('.analysis-panel');
    const teamOptionsList = document.getElementById('analysis-team-options');
    const teamSearchInputs = Array.from(document.querySelectorAll('.team-search-input'));

    let activeSubmitButton = null;
    let teamSearchTimer = null;

    const escapeHtml = (value = '') =>
        String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const getLeagueId = () => {
        if (!analysisLeagueSelect) return '';
        return analysisLeagueSelect.value || '';
    };

    const getTeamOptions = () => {
        if (!teamOptionsList) return [];
        return Array.from(teamOptionsList.querySelectorAll('option'));
    };

    const renderTeamOptions = (teams) => {
        if (!teamOptionsList) return;
        teamOptionsList.innerHTML = teams
            .map((team) => `<option value="${escapeHtml(team.name)}" data-id="${team.id}"></option>`)
            .join('');
    };

    const findTeamOptionByName = (inputValue) => {
        const normalized = (inputValue || '').trim().toLowerCase();
        if (!normalized) return null;

        return (
            getTeamOptions().find((option) => (option.value || '').trim().toLowerCase() === normalized) || null
        );
    };

    const syncTeamInput = (input) => {
        if (!input) return;
        const hiddenTarget = input.dataset.hiddenTarget;
        const hiddenInput = document.getElementById(hiddenTarget);
        if (!hiddenInput) return;

        const matchedOption = findTeamOptionByName(input.value);
        hiddenInput.value = matchedOption ? matchedOption.dataset.id : '';
    };

    const fetchTeamOptions = async (query = '') => {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (getLeagueId()) params.set('league', getLeagueId());

        if (!params.get('q') && !params.get('league')) return;

        const response = await fetch(`/teams/search?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load teams');
        }
        renderTeamOptions(data.teams || []);
    };

    const resolveTeamSelection = async (input, hiddenInput) => {
        if (!input || !hiddenInput) {
            return { id: '', name: '' };
        }

        syncTeamInput(input);
        if (hiddenInput.value) {
            return { id: hiddenInput.value, name: input.value.trim() };
        }

        const typedName = input.value.trim();
        if (typedName.length < 2) {
            return { id: '', name: typedName };
        }

        try {
            const params = new URLSearchParams({ q: typedName });
            if (getLeagueId()) params.set('league', getLeagueId());

            const response = await fetch(`/teams/search?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || !data.success || !Array.isArray(data.teams)) {
                return { id: '', name: typedName };
            }

            const exactMatch = data.teams.find(
                (team) => (team.name || '').trim().toLowerCase() === typedName.toLowerCase()
            );
            const candidate = exactMatch || (data.teams.length === 1 ? data.teams[0] : null);

            if (candidate) {
                hiddenInput.value = String(candidate.id);
                input.value = candidate.name;
                return { id: hiddenInput.value, name: input.value.trim() };
            }
        } catch (error) {
            console.error('Team resolution failed:', error.message);
        }

        return { id: hiddenInput.value || '', name: typedName };
    };

    const refreshTeamOptionsDebounced = (query) => {
        clearTimeout(teamSearchTimer);
        teamSearchTimer = setTimeout(async () => {
            try {
                await fetchTeamOptions(query);
            } catch (error) {
                console.error('Team search failed:', error.message);
            }
        }, 250);
    };

    const getOverUnderStat = (overUnder, threshold) => {
        if (!overUnder) return { count: 0, total: 0, percentage: 0 };
        const dottedKey = `over_${threshold}`;
        const underscoreKey = `over_${threshold.replace('.', '_')}`;
        return overUnder[dottedKey] || overUnder[underscoreKey] || { count: 0, total: 0, percentage: 0 };
    };

    const setLoadingState = (button, loading) => {
        if (!button) return;
        const textNode = button.querySelector('.btn-text');
        const loaderNode = button.querySelector('.btn-loader');

        if (textNode) textNode.classList.toggle('hidden', loading);
        if (loaderNode) loaderNode.classList.toggle('hidden', !loading);
        button.disabled = loading;
    };

    const resetButton = () => {
        if (activeSubmitButton) {
            setLoadingState(activeSubmitButton, false);
            activeSubmitButton = null;
        }
    };

    const revealResults = () => {
        if (!resultsContainer) return;
        resultsContainer.style.display = 'block';
        if (resultsPlaceholder) resultsPlaceholder.classList.add('hidden');
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const showLoading = (button) => {
        activeSubmitButton = button;
        setLoadingState(button, true);

        if (!resultsContainer) return;
        resultsContainer.innerHTML = `
            <div class="results-card loading">
                <div class="spinner"></div>
                <p>Crunching match data and generating insights...</p>
            </div>
        `;
        revealResults();
    };

    const showError = (message) => {
        if (!resultsContainer) return;
        resultsContainer.innerHTML = `
            <div class="results-card error-card">
                <h3 class="section-title mb-2">Analysis Error</h3>
                <p class="muted-text mb-0">${escapeHtml(message)}</p>
            </div>
        `;
        revealResults();
        resetButton();
    };

    const renderStandings = (data) => {
        if (!standingsContainer) return;
        standingsContainer.innerHTML = `
            <div class="results-card">
                <div class="section-header mb-2">
                    <div>
                        <h3 class="section-title">Season ${data.season}</h3>
                        <p class="section-subtitle">Top teams by current position</p>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Team</th>
                                <th>P</th>
                                <th>W</th>
                                <th>D</th>
                                <th>L</th>
                                <th>GD</th>
                                <th>Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.standings
                                .map(
                                    (row) => `
                                <tr>
                                    <td>${row.position}</td>
                                    <td>
                                        ${row.team_logo ? `<img src="${escapeHtml(row.team_logo)}" alt="" style="width:18px;height:18px;object-fit:contain;margin-right:6px;">` : ''}
                                        ${escapeHtml(row.team_name)}
                                    </td>
                                    <td>${row.played}</td>
                                    <td>${row.won}</td>
                                    <td>${row.drawn}</td>
                                    <td>${row.lost}</td>
                                    <td>${row.goal_difference}</td>
                                    <td><strong>${row.points}</strong></td>
                                </tr>
                            `
                                )
                                .join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        standingsContainer.style.display = 'block';
        if (standingsPlaceholder) standingsPlaceholder.classList.add('hidden');
    };

    const showStandingsError = (message) => {
        if (!standingsContainer) return;
        standingsContainer.innerHTML = `
            <div class="results-card error-card">
                <h3 class="section-title mb-2">Standings Error</h3>
                <p class="muted-text mb-0">${escapeHtml(message)}</p>
            </div>
        `;
        standingsContainer.style.display = 'block';
        if (standingsPlaceholder) standingsPlaceholder.classList.add('hidden');
    };

    const generateTimingBars = (goalTiming, type) => {
        const intervals = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
        return intervals
            .map((interval) => {
                const intervalData = goalTiming && goalTiming[interval] ? goalTiming[interval] : {};
                const value = Number(intervalData[type] || 0);
                const percentage = Number(intervalData[`${type}_percentage`] || 0);
                return `
                    <div class="timing-row">
                        <div class="timing-label">${interval} min</div>
                        <div class="timing-bar-container">
                            <div class="timing-bar ${type}" style="width: ${Math.min(percentage, 100)}%">
                                ${value} (${percentage}%)
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');
    };

    const generateOverUnderBoxes = (overUnder) => {
        const thresholds = ['0.5', '1.5', '2.5', '3.5', '4.5'];
        return thresholds
            .map((threshold) => {
                const stats = getOverUnderStat(overUnder, threshold);
                return `
                    <div class="ou-box">
                        <h4>Over ${threshold}</h4>
                        <div class="ou-percentage ${getPercentageClass(stats.percentage)}">${stats.percentage}%</div>
                        <p class="stat-note">${stats.count}/${stats.total}</p>
                    </div>
                `;
            })
            .join('');
    };

    const generateQuickStats = (analysis) => {
        const over25 = getOverUnderStat(analysis.over_under, '2.5');
        return `
            <div class="stats-grid">
                <div class="stat-box">
                    <h3>First to Score</h3>
                    <div class="stat-percentage ${getPercentageClass(analysis.first_to_score.percentage)}">${analysis.first_to_score.percentage}%</div>
                </div>
                <div class="stat-box">
                    <h3>BTTS</h3>
                    <div class="stat-percentage ${getPercentageClass(analysis.btts.percentage)}">${analysis.btts.percentage}%</div>
                </div>
                <div class="stat-box">
                    <h3>Over 2.5</h3>
                    <div class="stat-percentage ${getPercentageClass(over25.percentage)}">${over25.percentage}%</div>
                </div>
            </div>
        `;
    };

    const renderH2HMatches = (matches) => {
        if (!matches || matches.length === 0) {
            return `
                <div class="empty-state">
                    <h3>No direct meetings found</h3>
                    <p>No head-to-head matches available in the current database.</p>
                </div>
            `;
        }

        return `
            <div class="h2h-list">
                ${matches
                    .map((match) => {
                        const dateValue = new Date(match.match_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        });
                        return `
                            <article class="h2h-item">
                                <p><strong>${escapeHtml(match.home_team_name)}</strong> ${match.home_score} - ${match.away_score} <strong>${escapeHtml(match.away_team_name)}</strong></p>
                                <p class="muted-text">${dateValue}</p>
                            </article>
                        `;
                    })
                    .join('')}
            </div>
        `;
    };

    const displayTeamResults = (team, analysis) => {
        if (!resultsContainer) return;
        const teamName = team?.name ? escapeHtml(team.name) : 'Selected Team';
        const teamLogo = team?.logo ? `<img src="${escapeHtml(team.logo)}" alt="${teamName}" class="team-logo">` : '';
        const over25 = getOverUnderStat(analysis.over_under, '2.5');

        resultsContainer.innerHTML = `
            <div class="results-card">
                <header class="results-header">
                    <div class="d-flex align-items-center gap-2">
                        ${teamLogo}
                        <div>
                            <h2>${teamName} Analysis</h2>
                            <p>Based on ${analysis.matches_analyzed} recent matches</p>
                        </div>
                    </div>
                </header>

                <section class="stats-grid">
                    <article class="stat-box">
                        <h3>First to Score</h3>
                        <div class="stat-percentage ${getPercentageClass(analysis.first_to_score.percentage)}">${analysis.first_to_score.percentage}%</div>
                        <p class="stat-note">${analysis.first_to_score.count} of ${analysis.first_to_score.total}</p>
                    </article>
                    <article class="stat-box">
                        <h3>BTTS</h3>
                        <div class="stat-percentage ${getPercentageClass(analysis.btts.percentage)}">${analysis.btts.percentage}%</div>
                        <p class="stat-note">${analysis.btts.count} of ${analysis.btts.total}</p>
                    </article>
                    <article class="stat-box">
                        <h3>Over 2.5</h3>
                        <div class="stat-percentage ${getPercentageClass(over25.percentage)}">${over25.percentage}%</div>
                        <p class="stat-note">${over25.count} of ${over25.total}</p>
                    </article>
                </section>

                <section class="timing-section">
                    <h3>Goal Timing</h3>
                    <h4 class="timing-subtitle">Goals Scored</h4>
                    <div class="timing-bars">${generateTimingBars(analysis.goal_timing, 'scored')}</div>
                    <h4 class="timing-subtitle">Goals Conceded</h4>
                    <div class="timing-bars">${generateTimingBars(analysis.goal_timing, 'conceded')}</div>
                </section>

                <section class="timing-section">
                    <h3>Over/Under Distribution</h3>
                    <div class="over-under-grid">${generateOverUnderBoxes(analysis.over_under)}</div>
                </section>

                <section class="timing-section">
                    <h3>Home vs Away Record</h3>
                    <div class="home-away-grid">
                        <article class="venue-box">
                            <h4>Home</h4>
                            <p class="record">${analysis.home_away.home.wins}W - ${analysis.home_away.home.draws}D - ${analysis.home_away.home.losses}L</p>
                            <p class="stat-note">${analysis.home_away.home.total} matches</p>
                        </article>
                        <article class="venue-box">
                            <h4>Away</h4>
                            <p class="record">${analysis.home_away.away.wins}W - ${analysis.home_away.away.draws}D - ${analysis.home_away.away.losses}L</p>
                            <p class="stat-note">${analysis.home_away.away.total} matches</p>
                        </article>
                    </div>
                </section>
            </div>
        `;

        revealResults();
        resetButton();
    };

    const displayH2HResults = (data) => {
        if (!resultsContainer) return;

        const team1Info = data.team1?.info || {};
        const team2Info = data.team2?.info || {};
        const team1Analysis = data.team1?.analysis || {};
        const team2Analysis = data.team2?.analysis || {};
        const summary = data.h2h?.summary || { team1_wins: 0, team2_wins: 0, draws: 0 };

        const team1Name = escapeHtml(team1Info.name || 'Team 1');
        const team2Name = escapeHtml(team2Info.name || 'Team 2');
        const team1Logo = team1Info.logo ? `<img src="${escapeHtml(team1Info.logo)}" alt="${team1Name}" class="team-logo">` : '';
        const team2Logo = team2Info.logo ? `<img src="${escapeHtml(team2Info.logo)}" alt="${team2Name}" class="team-logo">` : '';

        resultsContainer.innerHTML = `
            <div class="results-card">
                <header class="results-header">
                    <div>
                        <h2>${team1Name} vs ${team2Name}</h2>
                        <p>${data.h2h?.total_matches || 0} direct meetings in dataset</p>
                    </div>
                </header>

                <section class="stats-grid">
                    <article class="stat-box">
                        <h3>${team1Name} Wins</h3>
                        <div class="stat-percentage high">${summary.team1_wins}</div>
                    </article>
                    <article class="stat-box">
                        <h3>Draws</h3>
                        <div class="stat-percentage medium">${summary.draws}</div>
                    </article>
                    <article class="stat-box">
                        <h3>${team2Name} Wins</h3>
                        <div class="stat-percentage low">${summary.team2_wins}</div>
                    </article>
                </section>

                <section class="timing-section">
                    <h3 class="mb-2">${team1Logo} ${team1Name} Quick Stats</h3>
                    ${generateQuickStats(team1Analysis)}
                </section>
                <section class="timing-section">
                    <h3 class="mb-2">${team2Logo} ${team2Name} Quick Stats</h3>
                    ${generateQuickStats(team2Analysis)}
                </section>
                <section class="timing-section">
                    <h3>Recent Meetings</h3>
                    ${renderH2HMatches(data.h2h?.matches)}
                </section>
            </div>
        `;

        revealResults();
        resetButton();
    };

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            tabButtons.forEach((tabButton) => tabButton.classList.remove('active'));
            panels.forEach((panel) => panel.classList.remove('active'));
            button.classList.add('active');
            const selectedPanel = document.getElementById(`${tabName}-analysis`);
            if (selectedPanel) selectedPanel.classList.add('active');
        });
    });

    teamSearchInputs.forEach((input) => {
        input.addEventListener('input', () => {
            syncTeamInput(input);
            refreshTeamOptionsDebounced(input.value.trim());
        });
        input.addEventListener('change', () => syncTeamInput(input));
        input.addEventListener('blur', () => syncTeamInput(input));
        input.addEventListener('focus', async () => {
            try {
                await fetchTeamOptions(input.value.trim());
            } catch (error) {
                console.error(error.message);
            }
        });
        syncTeamInput(input);
    });

    if (analysisLeagueSelect) {
        analysisLeagueSelect.addEventListener('change', async () => {
            teamSearchInputs.forEach((input) => {
                const hiddenInput = document.getElementById(input.dataset.hiddenTarget);
                input.value = '';
                if (hiddenInput) hiddenInput.value = '';
            });

            try {
                await fetchTeamOptions('');
            } catch (error) {
                console.error(error.message);
            }
        });
    }

    if (loadStandingsBtn) {
        loadStandingsBtn.addEventListener('click', async () => {
            const leagueId = getLeagueId();
            if (!leagueId) {
                showStandingsError('Select a league first.');
                return;
            }

            try {
                const response = await fetch(`/analysis/standings/${leagueId}`);
                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to load standings.');
                }
                renderStandings(data);
            } catch (error) {
                showStandingsError(error.message || 'Failed to load standings.');
            }
        });
    }

    if (singleTeamForm) {
        singleTeamForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = singleTeamForm.querySelector('button[type="submit"]');
            const teamInput = document.getElementById('teamSearch');
            const hiddenTeamInput = document.getElementById('team');
            const matches = document.getElementById('matches');
            const homeAway = document.getElementById('homeAway');

            const resolvedTeam = await resolveTeamSelection(teamInput, hiddenTeamInput);
            const teamId = resolvedTeam.id;
            if (!teamId) {
                console.warn('Single-team analysis blocked: unresolved team selection', {
                    typed: teamInput ? teamInput.value : ''
                });
                showError('Select a valid team from the list.');
                return;
            }

            showLoading(submitButton);

            try {
                const response = await fetch(`/analysis/team/${teamId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        matches: matches ? matches.value : 10,
                        homeAway: homeAway ? homeAway.value : 'both'
                    })
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to analyze team.');
                }

                displayTeamResults(data.team, data.analysis);
            } catch (error) {
                showError(error.message || 'Failed to analyze team.');
            }
        });
    }

    if (h2hForm) {
        h2hForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = h2hForm.querySelector('button[type="submit"]');
            const teamOneInput = document.getElementById('team1Search');
            const teamTwoInput = document.getElementById('team2Search');
            const teamOneHidden = document.getElementById('team1');
            const teamTwoHidden = document.getElementById('team2');
            const matches = document.getElementById('h2hMatches');

            const resolvedTeam1 = await resolveTeamSelection(teamOneInput, teamOneHidden);
            const resolvedTeam2 = await resolveTeamSelection(teamTwoInput, teamTwoHidden);
            const team1Id = resolvedTeam1.id;
            const team2Id = resolvedTeam2.id;
            if (!team1Id || !team2Id) {
                console.warn('H2H blocked: unresolved team selection', {
                    team1Typed: teamOneInput ? teamOneInput.value : '',
                    team2Typed: teamTwoInput ? teamTwoInput.value : ''
                });
                showError('Select both teams from the search list.');
                return;
            }
            if (team1Id === team2Id) {
                console.warn('H2H blocked: identical team IDs selected', { team1Id, team2Id });
                showError('Choose two different teams for H2H analysis.');
                return;
            }

            showLoading(submitButton);

            try {
                const response = await fetch('/analysis/h2h', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        team1Id,
                        team2Id,
                        matches: matches ? matches.value : 10
                    })
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to compare teams.');
                }

                displayH2HResults(data);
            } catch (error) {
                showError(error.message || 'Failed to compare teams.');
            }
        });
    }

    // Prefill single-team selector from query param (?team=ID)
    const initialTeamId = new URLSearchParams(window.location.search).get('team');
    if (initialTeamId) {
        const initialOption = getTeamOptions().find((option) => option.dataset.id === initialTeamId);
        const teamInput = document.getElementById('teamSearch');
        const hiddenTeamInput = document.getElementById('team');
        if (initialOption && teamInput && hiddenTeamInput) {
            teamInput.value = initialOption.value;
            hiddenTeamInput.value = initialOption.dataset.id;
        }
    }
});

function getPercentageClass(percentage) {
    const value = Number(percentage || 0);
    if (value >= 70) return 'high';
    if (value >= 40) return 'medium';
    return 'low';
}
