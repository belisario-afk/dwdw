# KillaDome Changelog

All notable changes to the KillaDome plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-21

### Added - Initial Release

#### Core Systems
- **DomeManager**: Complete match lifecycle management
  - Match queue system
  - Arena and lobby teleportation
  - Match start/stop controls
  - Automatic player management

- **LobbyUI**: Full-featured CUI interface
  - Five-tab navigation (Play/Loadouts/Store/Stats/Settings)
  - Responsive UI with cursor support
  - Tab-specific content rendering
  - Clean close/escape handling

- **LoadoutEditor**: Weapon customization system
  - Drag-and-drop emulation with ghost preview
  - Click-to-pick and click-to-place fallback
  - Attachment slot management
  - Skin application system

- **AttachmentSystem**: Comprehensive attachment framework
  - Multiple attachment types (barrel/mag/optic/stock)
  - 5-level upgrade system per attachment
  - Stat modifier calculations
  - VFX/SFX tag support

- **WeaponProgression**: Persistent weapon leveling
  - 10-level progression per weapon
  - Base stat definitions for all weapons
  - Experience tracking
  - Level-based unlocks

- **VFXManager & SFXManager**: Effect systems
  - Client-side VFX triggering
  - Sound effect localization
  - Tag-based effect mapping
  - Performance-optimized RPC calls

- **ForgeStationSystem**: Upgrade interface
  - Cost calculation formulas
  - Upgrade validation
  - Token transaction handling
  - Preview system (before/after stats)

- **BloodTokenEconomy**: In-game currency
  - Token earning on kills
  - Spending validation
  - Balance tracking
  - Transaction logging

- **StoreAPI**: Purchase system
  - Item purchase interface
  - Tebex integration hooks
  - Transaction verification
  - Purchase history tracking

- **SaveManager**: Data persistence
  - JSON-based player profiles
  - Atomic file writes (temp + move)
  - Auto-save system (5-minute intervals)
  - Corruption recovery

- **AntiExploit**: Security layer
  - Rate limiting (5 actions/second)
  - Server-side validation
  - Input sanitization
  - Suspicious activity detection

- **TelemetrySystem**: Analytics
  - Event tracking (kills, purchases, sessions)
  - Statistics aggregation
  - Performance monitoring
  - Usage analytics

#### Player Features
- Automatic lobby spawn on connect
- Persistent progression across sessions
- Blood Token earning per kill (default: 10 tokens)
- Weapon and attachment upgrades
- Skin collection system
- VIP status support
- K/D tracking
- Match history

#### Admin Features
- Console commands for server management
- Player progress reset capability
- Skin granting system
- Match force-start
- Debug logging mode
- Permission-based access control

#### UI Features
- Full-screen lobby interface
- Tabbed navigation system
- Queue join interface
- Stats display
- Responsive button layout
- Color-coded elements
- Close button (X)

#### Commands
**Player Commands:**
- `/kd` - Show help menu
- `/kd open` - Open lobby UI
- `/kd stats` - View statistics
- `/kd help` - Show command list

**Admin Commands:**
- `kd.open` - Force open UI
- `kd.start` - Force start match
- `kd.giveskin <steamid> <skinid>` - Grant skin
- `kd.resetprogress <steamid>` - Reset player progress

#### Permissions
- `killadome.admin` - Admin command access
- `killadome.vip` - VIP features and benefits

#### Configuration
- Configurable spawn positions (lobby and arena)
- Adjustable starting token amount
- Customizable tokens per kill
- Tebex integration toggle
- Max weapon/attachment levels
- UI update throttle control
- Auto-save interval settings
- Debug logging toggle

#### Data Models
- PlayerProfile with full persistence
- Loadout system with multiple slots
- Weapon level tracking
- Attachment level tracking
- Owned skins list
- Match statistics
- Timestamp tracking

#### Performance Optimizations
- No LINQ usage (all foreach loops)
- Object pooling for frequently used structures
- Throttled UI updates (100ms default)
- Minimal GC allocations on hot paths
- Batched file saves
- Async I/O operations
- Rate-limited RPCs

#### Security Features
- Server-side authority for all actions
- Rate limiting on player actions
- Purchase verification (Tebex)
- Input validation and sanitization
- Atomic file writes prevent corruption
- Session validation

#### Documentation
- Comprehensive README.md (379 lines)
- Technical ARCHITECTURE.md (471 lines)
- Step-by-step INSTALL.md (427 lines)
- Configuration examples
- Player profile examples

### Technical Details

**Lines of Code:**
- Main Plugin: 1,720 lines
- Total Documentation: 1,277 lines
- Total Project: 2,997 lines

**Module Count:** 13 internal systems

**Supported Weapons:**
- AK-47 (assault rifle)
- M249 (light machine gun)
- Pistol (sidearm)

**Supported Attachments:**
- Silencer (barrel)
- Extended Magazine (magazine)
- Reflex Sight (optic)

**Data Persistence:**
- JSON format
- Per-player files
- Auto-save every 5 minutes
- Atomic writes with temp files

**Network Optimization:**
- Minimal RPC calls
- Batched updates
- Client-side effect rendering
- Compressed data transfer

### Known Limitations

- CUI-based UI (no native drag-and-drop)
- Single server architecture (no cross-server support)
- English language only
- Limited to Rust's CUI capabilities
- Requires modern Oxide/Umod version

### Future Plans

See ARCHITECTURE.md for planned enhancements including:
- Team-based matches
- Killstreak rewards
- Seasonal events
- Leaderboards
- Custom game modes
- Multi-language support

---

## Version History

### [1.0.0] - 2025-11-21
- Initial release with full feature set
- Production-ready single-file plugin
- Complete documentation suite

---

## Upgrade Guide

### From Nothing to 1.0.0
This is the initial release. Follow INSTALL.md for setup instructions.

---

## Support

For issues, questions, or contributions:
1. Check INSTALL.md for troubleshooting
2. Review ARCHITECTURE.md for technical details
3. Enable debug logging for detailed traces
4. Report issues with full error logs

---

## Credits

**Development Team:** KillaDome Dev Team  
**Framework:** Oxide/Umod  
**Game:** Rust by Facepunch Studios  
**License:** MIT (modify as needed)

---

## Changelog Format

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
