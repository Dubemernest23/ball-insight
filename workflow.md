npUser: "Analyze Chelsea last 10 games"
    ↓
1. Check analysis_cache table
    ├─ Found & Fresh (< 24hrs)? → Serve instantly ✅
    └─ Not found or stale? → Continue...
    ↓
2. Check matches table for Chelsea
    ├─ Have 10 matches? → Use them ✅
    └─ Missing matches? → Fetch from API
    ↓
3. Fetch match events (goals with timestamps)
    ↓
4. Run Analysis:
    ├─ Goal timing (6 intervals with percentages)
    ├─ First to score (count + percentage)
    ├─ BTTS (count + percentage)
    ├─ Over/Under (5 thresholds)
    ├─ Home/Away splits
    └─ HT/FT patterns
    ↓
5. Cache results (expires in 24 hours)
    ↓
6. Return beautiful JSON to user

