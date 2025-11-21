# KillaDome - Full COD-Style Rust Server Plugin

## Overview

KillaDome is a comprehensive Oxide/Umod plugin that transforms your Rust server into a Call of Duty-style experience with:

- **Lobby System**: Players spawn in a lobby with a full-featured UI
- **Loadout Editor**: Drag-and-drop weapon customization with attachments
- **Weapon Progression**: Persistent weapon levels and upgrades across matches  
- **Blood Token Economy**: Earn and spend in-game currency
- **Store Integration**: Tebex-compatible store for cosmetics and items
- **VFX/SFX System**: Custom visual and sound effects for weapons
- **Anti-Exploit**: Rate limiting and server-side validation
- **Telemetry**: Analytics and event tracking

## Features

### 🎮 Player Experience
1. **Join Server** → Teleported to lobby with start screen UI
2. **Lobby UI** with tabs:
   - **Play**: Join match queue or start private match
   - **Loadouts**: Customize weapons with drag-and-drop interface
   - **Store**: Purchase skins, VIP passes, and upgrades
   - **Stats**: View kill/death ratio, tokens, and progression
   - **Settings**: Configure preferences

3. **Match System**: Queue system teleports players to arena when match starts
4. **Persistent Progression**: Weapon levels, attachments, and skins persist across sessions

### 🔧 System Architecture

#### Core Modules
- **DomeManager**: Match lifecycle, arena management, queue system
- **LobbyUI**: CUI-based user interface with tabs and interactions
- **LoadoutEditor**: Weapon and attachment management with emulated drag-drop
- **AttachmentSystem**: Attachment definitions, stat modifiers, VFX/SFX tags
- **WeaponProgression**: Leveling system with stat multipliers
- **ForgeStationSystem**: Upgrade UI and cost calculations
- **BloodTokenEconomy**: Currency earning and spending
- **StoreAPI**: Purchase system with Tebex integration hooks
- **SaveManager**: Atomic file I/O with JSON persistence
- **AntiExploit**: Rate limiting and validation
- **VFXManager/SFXManager**: Client-side effect triggers
- **TelemetrySystem**: Event tracking and analytics

## Installation

1. Copy `KillaDome.cs` to your Oxide plugins folder: `/oxide/plugins/`
2. The plugin will auto-generate a config file on first load
3. Reload the plugin: `oxide.reload KillaDome`

## Configuration

Configuration file is generated at `/oxide/config/KillaDome.json`:

```json
{
  "Lobby Spawn Position": { "x": 0, "y": 100, "z": 0 },
  "Arena Spawn Position": { "x": 0, "y": 100, "z": 500 },
  "Starting Blood Tokens": 500,
  "Tokens Per Kill": 10,
  "Enable Tebex Integration": false,
  "Tebex Secret Key": "YOUR_SECRET_KEY_HERE",
  "Max Weapon Level": 10,
  "Max Attachment Level": 5,
  "UI Update Throttle MS": 100,
  "Auto Save Interval Seconds": 300.0,
  "Enable Debug Logging": false
}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `Lobby Spawn Position` | Where players spawn when connecting | (0, 100, 0) |
| `Arena Spawn Position` | Where players spawn during matches | (0, 100, 500) |
| `Starting Blood Tokens` | Initial currency for new players | 500 |
| `Tokens Per Kill` | Tokens awarded per kill | 10 |
| `Enable Tebex Integration` | Enable Tebex store API | false |
| `Max Weapon Level` | Maximum weapon level | 10 |
| `Max Attachment Level` | Maximum attachment level | 5 |
| `UI Update Throttle MS` | UI refresh rate limit | 100 |
| `Auto Save Interval Seconds` | How often to auto-save player data | 300 |
| `Enable Debug Logging` | Verbose logging for debugging | false |

## Commands

### Chat Commands
- `/kd` - Show help menu
- `/kd open` - Open lobby UI
- `/kd stats` - View your stats
- `/kd help` - Show command list

### Console Commands (Admin Only)

Requires permission: `killadome.admin`

- `kd.open` - Force open lobby UI for a player
- `kd.start` - Force start a match
- `kd.giveskin <steamid> <skinid>` - Grant a skin to a player
- `kd.resetprogress <steamid>` - Reset a player's progression

## Permissions

```
killadome.admin - Admin commands and controls
killadome.vip - VIP features and benefits
```

Grant permissions using:
```
oxide.grant user <username> killadome.admin
oxide.grant group <groupname> killadome.vip
```

## Data Persistence

Player data is saved in JSON format at `/oxide/data/KillaDome/<steamid>.json`

### Player Profile Structure
```json
{
  "SteamID": "76561198XXXXXXXX",
  "Loadouts": [
    {
      "Name": "Default",
      "Primary": "ak47",
      "Secondary": "pistol",
      "PrimaryAttachments": {
        "barrel": "silencer",
        "mag": "extended_mag",
        "optic": "reflex"
      },
      "Skins": {
        "primarySkin": "neon_serpent_v2"
      }
    }
  ],
  "WeaponLevels": {
    "ak47": 6,
    "m249": 2
  },
  "AttachmentLevels": {
    "silencer": 3,
    "extended_mag": 2
  },
  "OwnedSkins": ["neon_serpent_v2", "firestorm_set"],
  "Tokens": 1234,
  "IsVIP": true,
  "TotalKills": 45,
  "TotalDeaths": 23,
  "MatchesPlayed": 12,
  "LastUpdated": "2025-11-20T17:00:00Z"
}
```

## Weapon System

### Included Weapons
- **AK-47**: High damage assault rifle (Max Level: 10)
- **M249**: Light machine gun with high fire rate (Max Level: 10)

### Attachments
- **Silencer** (Barrel): Reduces noise, slight damage penalty
- **Extended Magazine** (Magazine): 50% more ammo, slower reload
- **Reflex Sight** (Optic): Improved accuracy

### Upgrade System
- Weapons gain levels through use and purchases
- Each level provides stat multipliers
- Attachments have levels (0-5) with increasing effects
- Upgrade costs scale: Base Cost × (Level + 1)

## Store Integration

### Tebex Setup
1. Set `Enable Tebex Integration` to `true` in config
2. Add your Tebex secret key to `Tebex Secret Key`
3. Configure webhook to call `ProcessTebexPurchase` method
4. Items are validated server-side before granting

### Store Items
- Weapon skins
- VIP passes
- Token packs
- Cosmetic attachments
- Season passes

## UI System

The plugin uses Rust's CUI (Cui) system for UI rendering:

### Emulated Drag-and-Drop
- Click items in image library to select
- Click weapon slots to place selected item
- Ghost preview follows cursor (emulated)
- Fallback click-to-pick and click-to-place system

### Small Box/Stash Grid
- Grid of uniform boxes for item display
- Each box represents an inventory slot
- Tooltip on hover shows item details

### Tabs
- Play: Match queue and status
- Loadouts: Weapon customization
- Store: Purchase interface
- Stats: Personal statistics
- Settings: Configuration options

## Performance

### Optimizations
- **No LINQ**: All collections use foreach loops
- **Object Pooling**: Reusable data structures
- **Throttled Updates**: UI updates limited to configurable rate
- **Atomic Saves**: File writes use temp file + atomic swap
- **Rate Limiting**: RPC and action rate limits per player
- **GC-Friendly**: Minimal allocations on hot paths

### Memory Management
- Auto-save every 5 minutes (configurable)
- Session cleanup on disconnect
- Proper dispose on plugin unload

## Security

### Anti-Exploit Features
- Server-side validation for all actions
- Rate limiting (default: 5 actions/second)
- Purchase verification
- Input sanitization
- Tebex transaction validation (when enabled)

### Best Practices
- All currency transactions validated server-side
- Client requests are only triggers
- No trust of client-provided values
- Signed purchase receipts (Tebex)

## Development & Extension

### Event Hooks
Expose these internal events for other plugins:

```csharp
OnPlayerPurchasedSkin(ulong steamId, string skinId)
OnWeaponUpgraded(ulong steamId, string weaponId, int level)
OnMatchStarted(string matchId)
OnMatchEnded(string matchId)
```

### Extending Weapons
Add new weapons in `WeaponProgression.InitializeWeapons()`:

```csharp
["new_weapon"] = new WeaponDefinition
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
}
```

### Adding Attachments
Add new attachments in `AttachmentSystem.InitializeAttachments()`:

```csharp
["new_attachment"] = new AttachmentDefinition
{
    Id = "new_attachment",
    Name = "New Attachment",
    Slot = "barrel",
    MaxLevel = 5,
    StatModifiers = new Dictionary<string, float>
    {
        ["accuracy"] = 1.3f
    }
}
```

## Troubleshooting

### Common Issues

**Q: Players can't see the UI**
- Check if CUI is enabled on the server
- Verify player has no conflicting UI plugins
- Check console for errors

**Q: Saves aren't persisting**
- Verify `/oxide/data/KillaDome/` directory exists
- Check file permissions
- Enable debug logging to see save errors

**Q: High memory usage**
- Reduce auto-save interval
- Check for memory leaks in logs
- Ensure plugin is latest version

**Q: Tebex purchases not working**
- Verify secret key is correct
- Check Tebex webhook URL
- Enable debug logging
- Verify purchase with Tebex dashboard

## Support & Updates

### Reporting Issues
When reporting issues, include:
1. Server Oxide/Umod version
2. Plugin version
3. Error messages from console
4. Steps to reproduce

### Debug Mode
Enable in config: `"Enable Debug Logging": true`

This logs:
- Player connections/disconnections
- UI interactions
- Purchase attempts
- Save operations
- Token transactions

## Credits

- **Version**: 1.0.0
- **Author**: KillaDome Dev Team
- **License**: MIT (modify as needed)
- **Oxide**: Built for Oxide/Umod plugin framework
- **Rust**: Game server plugin for Rust by Facepunch Studios

## Changelog

### v1.0.0 (Initial Release)
- Full lobby system with UI
- Weapon and attachment system
- Persistent progression
- Blood Token economy
- Store API with Tebex integration
- VFX/SFX managers
- Anti-exploit protection
- Telemetry system
- Auto-save functionality
- Admin commands

## Future Enhancements

Planned features for future versions:
- More weapons and attachments
- Killstreaks and rewards
- Seasonal events
- Leaderboards
- Team-based matches
- Custom game modes
- Advanced statistics dashboard
- Mobile-friendly UI option
- Multi-language support

---

## Quick Start Guide

1. **Install** the plugin in `/oxide/plugins/`
2. **Configure** spawn positions in `/oxide/config/KillaDome.json`
3. **Grant** admin permission: `oxide.grant user YourName killadome.admin`
4. **Join** your server
5. **Open** lobby with `/kd open`
6. **Customize** loadouts and start playing!

For detailed documentation and updates, visit the repository.
