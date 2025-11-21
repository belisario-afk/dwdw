# KillaDome Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     KillaDome Plugin                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Main Plugin Controller                     │ │
│  │  - Oxide Hook Management                                │ │
│  │  - Session Management                                   │ │
│  │  - Component Orchestration                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ DomeManager  │  │  LobbyUI     │  │LoadoutEditor │     │
│  │              │  │              │  │              │     │
│  │ - Matches    │  │ - CUI Render │  │ - Inventory  │     │
│  │ - Queue      │  │ - Tabs       │  │ - Drag/Drop  │     │
│  │ - Teleport   │  │ - Events     │  │ - Validation │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Attachment    │  │  Weapon      │  │  Forge       │     │
│  │System        │  │  Progression │  │  Station     │     │
│  │              │  │              │  │              │     │
│  │ - Definitions│  │ - Levels     │  │ - Upgrades   │     │
│  │ - Stat Mods  │  │ - XP         │  │ - Cost Calc  │     │
│  │ - VFX/SFX    │  │ - Unlocks    │  │ - UI         │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Blood Token  │  │  Store API   │  │  Save        │     │
│  │ Economy      │  │              │  │  Manager     │     │
│  │              │  │ - Purchases  │  │              │     │
│  │ - Award      │  │ - Tebex      │  │ - Load/Save  │     │
│  │ - Spend      │  │ - Validation │  │ - Atomic I/O │     │
│  │ - Balance    │  │ - Catalog    │  │ - JSON       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Anti-Exploit │  │ Telemetry    │  │ VFX/SFX      │     │
│  │              │  │              │  │ Managers     │     │
│  │ - Rate Limit │  │ - Events     │  │              │     │
│  │ - Validation │  │ - Analytics  │  │ - Client RPC │     │
│  │ - Security   │  │ - Stats      │  │ - Effects    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Player Connection Flow
```
Player Connects
    ↓
OnPlayerConnected Hook
    ↓
Load PlayerProfile (SaveManager)
    ↓
Create PlayerSession
    ↓
Teleport to Lobby
    ↓
Show Lobby UI (LobbyUI)
    ↓
Player Interacts with UI
    ↓
Process Actions (Various Managers)
    ↓
Auto-Save Profile (SaveManager)
```

### Match Flow
```
Player Clicks "Join Queue"
    ↓
DomeManager.AddToQueue()
    ↓
Admin Starts Match
    ↓
DomeManager.StartMatch()
    ↓
Teleport Players to Arena
    ↓
Match Active
    ↓
Track Stats (Telemetry)
    ↓
Match Ends
    ↓
Return Players to Lobby
    ↓
Save Progression
```

### Upgrade Flow
```
Player Opens Forge UI
    ↓
Select Weapon/Attachment
    ↓
ForgeStation.UpgradeAttachment()
    ↓
Check Cost (BloodTokenEconomy)
    ↓
Validate (AntiExploit)
    ↓
Spend Tokens
    ↓
Apply Upgrade
    ↓
Save Profile
    ↓
Update UI
```

## UI Architecture

### Lobby UI Layout
```
┌─────────────────────────────────────────────────────────┐
│                      KILLADOME                        [X]│
├─────────────────────────────────────────────────────────┤
│ [PLAY] [LOADOUTS] [STORE] [STATS] [SETTINGS]           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│                  Tab Content Area                        │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Play Tab
```
┌─────────────────────────────────────────────────────────┐
│                   READY TO PLAY?                         │
│                                                          │
│                  ┌──────────────┐                       │
│                  │  JOIN QUEUE  │                       │
│                  └──────────────┘                       │
│                                                          │
│              Blood Tokens: 1234                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Loadouts Tab (Concept)
```
┌─────────────────────────────────────────────────────────┐
│ Weapons:                        Current Loadout:        │
│ ┌───┬───┬───┬───┐              ┌──────────────┐       │
│ │AK │M4 │M2 │LR │              │   Primary    │       │
│ └───┴───┴───┴───┘              │   ┌──────┐   │       │
│                                 │   │ AK47 │   │       │
│ Attachments:                    │   └──────┘   │       │
│ ┌───┬───┬───┬───┐              │              │       │
│ │SIL│MAG│OPT│STK│              │  Attachments:│       │
│ └───┴───┴───┴───┘              │  [SIL][MAG] │       │
│                                 │              │       │
│ Skins:                          │   Secondary  │       │
│ ┌───┬───┬───┬───┐              │   ┌──────┐   │       │
│ │CR1│CR2│CR3│CR4│              │   │ PSTL │   │       │
│ └───┴───┴───┴───┘              │   └──────┘   │       │
└─────────────────────────────────────────────────────────┘
```

### Store Tab (Concept)
```
┌─────────────────────────────────────────────────────────┐
│ Featured Items:                    Balance: 1234 🪙     │
│ ┌────────────┬────────────┬────────────┬────────────┐ │
│ │  Neon      │  Fire      │  Arctic    │   Gold     │ │
│ │  Serpent   │  Storm     │  Camo      │   Rush     │ │
│ │  500 🪙    │  750 🪙    │  600 🪙    │  1000 🪙   │ │
│ │  [BUY]     │  [BUY]     │  [BUY]     │  [BUY]     │ │
│ └────────────┴────────────┴────────────┴────────────┘ │
│                                                          │
│ VIP Pass:                                               │
│ ┌────────────────────────────────────────────┐         │
│ │ 30 Days VIP - $9.99                        │         │
│ │ - 2x Token Earn Rate                       │         │
│ │ - Exclusive Skins                          │         │
│ │ - Priority Queue                           │         │
│ │              [PURCHASE]                    │         │
│ └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

## Data Models

### PlayerProfile
```
PlayerProfile
├── SteamID: ulong
├── Loadouts: List<Loadout>
│   └── Loadout
│       ├── Name: string
│       ├── Primary: string
│       ├── Secondary: string
│       ├── PrimaryAttachments: Dict<string, string>
│       ├── SecondaryAttachments: Dict<string, string>
│       ├── Skins: Dict<string, string>
│       ├── Lethal: string
│       ├── Tactical: string
│       └── Perks: List<string>
├── WeaponLevels: Dict<string, int>
├── AttachmentLevels: Dict<string, int>
├── OwnedSkins: List<string>
├── Tokens: int
├── IsVIP: bool
├── TotalKills: int
├── TotalDeaths: int
├── MatchesPlayed: int
└── LastUpdated: DateTime
```

### WeaponDefinition
```
WeaponDefinition
├── Id: string
├── Name: string
├── MaxLevel: int
└── BaseStats: Dict<string, float>
    ├── damage
    ├── fire_rate
    ├── accuracy
    ├── mag_size
    └── reload_speed
```

### AttachmentDefinition
```
AttachmentDefinition
├── Id: string
├── Name: string
├── Slot: string (barrel/mag/optic/stock)
├── MaxLevel: int
├── StatModifiers: Dict<string, float>
├── VFXTag: string
└── SFXTag: string
```

## Performance Considerations

### Memory Optimization
- **No LINQ**: All iterations use `foreach` loops
- **Object Pooling**: Reuse data structures where possible
- **Lazy Loading**: Load player data only when needed
- **Throttled Updates**: UI updates limited to 100ms intervals
- **GC-Friendly**: Minimal allocations in hot paths

### Network Optimization
- **Batched RPCs**: Combine multiple commands when possible
- **Compressed Data**: Use compact JSON for network transfers
- **Client-Side Caching**: UI state cached on client
- **Rate Limiting**: 5 actions/second per player

### File I/O Optimization
- **Atomic Writes**: Temp file + move prevents corruption
- **Batched Saves**: Auto-save every 5 minutes
- **Async Operations**: Non-blocking file operations
- **Error Recovery**: Graceful handling of corrupt saves

## Security Architecture

### Anti-Exploit Layers

```
Client Request
    ↓
Rate Limiter (5/sec)
    ↓
AntiExploit.ValidateAction()
    ↓
Server-Side Logic
    ↓
State Validation
    ↓
Apply Changes
    ↓
Save & Respond
```

### Validation Points
1. **Action Rate**: 5 actions per second limit
2. **Resource Validation**: Check token balance before spend
3. **State Checks**: Verify player state is valid
4. **Input Sanitization**: Validate all user inputs
5. **Purchase Verification**: Tebex transactions verified

### Security Features
- Server-side authority for all state changes
- No trust of client-provided values
- Signed purchase receipts (Tebex integration)
- Rate limiting on all RPC endpoints
- Input validation and sanitization

## Extension Points

### Adding New Weapons
```csharp
// In WeaponProgression.InitializeWeapons()
_weapons["new_weapon"] = new WeaponDefinition
{
    Id = "new_weapon",
    Name = "New Weapon",
    MaxLevel = 10,
    BaseStats = new Dictionary<string, float>
    {
        ["damage"] = 40f,
        ["fire_rate"] = 0.15f,
        ["accuracy"] = 0.8f
    }
};
```

### Adding New Attachments
```csharp
// In AttachmentSystem.InitializeAttachments()
_attachments["new_attachment"] = new AttachmentDefinition
{
    Id = "new_attachment",
    Name = "New Attachment",
    Slot = "barrel",
    MaxLevel = 5,
    StatModifiers = new Dictionary<string, float>
    {
        ["accuracy"] = 1.3f,
        ["recoil"] = 0.9f
    },
    VFXTag = "muzzle_flash_enhanced",
    SFXTag = "shot_heavy"
};
```

### Event Hooks for Other Plugins
```csharp
// Example: Hook into weapon upgrades
void OnWeaponUpgraded(ulong steamId, string weaponId, int newLevel)
{
    // Custom plugin logic here
}

// Example: Hook into purchases
void OnPlayerPurchasedSkin(ulong steamId, string skinId)
{
    // Custom plugin logic here
}

// Example: Hook into match events
void OnMatchStarted(string matchId)
{
    // Custom plugin logic here
}

void OnMatchEnded(string matchId)
{
    // Custom plugin logic here
}
```

## Deployment Architecture

```
Rust Server
├── RustDedicated.exe
├── oxide/
│   ├── plugins/
│   │   └── KillaDome.cs  ← Main Plugin
│   ├── config/
│   │   └── KillaDome.json  ← Configuration
│   ├── data/
│   │   └── KillaDome/
│   │       ├── 76561198000000001.json  ← Player Data
│   │       ├── 76561198000000002.json
│   │       └── ...
│   └── logs/
│       └── oxide_debug.log
```

## Scaling Considerations

### Single Server (Default)
- Up to 200 concurrent players
- Local JSON storage
- In-memory session cache
- Direct file I/O

### Multi-Server (Future)
- Shared database (MySQL/PostgreSQL)
- Redis for session cache
- Centralized save service
- Load balancer for matches

## Monitoring & Telemetry

### Tracked Events
- Player connections/disconnections
- Match starts/ends
- Weapon upgrades
- Purchases
- Kills/deaths
- Token transactions
- UI interactions

### Analytics Queries
```csharp
// Get total kills across all players
var stats = _telemetry.GetStats();
int totalKills = stats["kills"];

// Get player K/D ratio
var profile = _saveManager.LoadPlayerProfile(steamId);
float kd = (float)profile.TotalKills / profile.TotalDeaths;

// Get most popular weapon
var weaponUsage = new Dictionary<string, int>();
foreach (var session in _activeSessions.Values)
{
    foreach (var weapon in session.Profile.WeaponLevels.Keys)
    {
        // Track usage
    }
}
```

## Error Handling

### Graceful Degradation
1. **Save Failure**: Log error, retry on next save cycle
2. **UI Render Error**: Close and reopen UI
3. **Invalid Config**: Load defaults, log warning
4. **Corrupt Player Data**: Create new profile, backup corrupt file
5. **Tebex Timeout**: Queue purchase for retry

### Logging Levels
- **ERROR**: Critical failures that prevent operation
- **WARNING**: Issues that may cause problems
- **INFO**: Normal operation events (when debug enabled)
- **DEBUG**: Detailed trace information (when debug enabled)

## Future Enhancements

### Planned Features
- [ ] Team-based matches
- [ ] Killstreak rewards
- [ ] Seasonal events
- [ ] Leaderboards
- [ ] Custom game modes
- [ ] Advanced stat dashboard
- [ ] Mobile-friendly UI
- [ ] Multi-language support
- [ ] Voice chat integration
- [ ] Replay system

### API Enhancements
- [ ] RESTful API for external tools
- [ ] WebSocket for real-time stats
- [ ] Discord bot integration
- [ ] Twitch integration for streamers
- [ ] Steam Workshop support

---

This architecture supports high-performance, scalable gameplay while maintaining security and data integrity. The modular design allows for easy extension and customization.
