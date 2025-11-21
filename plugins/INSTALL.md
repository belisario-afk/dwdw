# KillaDome - Quick Installation Guide

## Prerequisites

Before installing KillaDome, ensure you have:

- ✅ Rust Dedicated Server (Windows or Linux)
- ✅ Oxide/Umod installed and running
- ✅ Server admin access
- ✅ Basic knowledge of Oxide commands

## Installation Steps

### 1. Download and Install

```bash
# Copy KillaDome.cs to your Oxide plugins folder
cp KillaDome.cs /path/to/rust_server/oxide/plugins/
```

**Windows**: `C:\RustServer\oxide\plugins\KillaDome.cs`  
**Linux**: `/home/rust/server/oxide/plugins/KillaDome.cs`

### 2. Load the Plugin

Connect to your server console or RCON and run:

```
oxide.reload KillaDome
```

You should see:
```
[Oxide] Loaded plugin KillaDome v1.0.0 by KillaDome
```

### 3. Configure the Plugin

The plugin auto-generates a config file at:
`oxide/config/KillaDome.json`

Edit the configuration to match your server:

```json
{
  "Lobby Spawn Position": {
    "x": 0.0,
    "y": 100.0,
    "z": 0.0
  },
  "Arena Spawn Position": {
    "x": 0.0,
    "y": 100.0,
    "z": 500.0
  },
  "Starting Blood Tokens": 500,
  "Tokens Per Kill": 10,
  "Enable Tebex Integration": false,
  "Max Weapon Level": 10,
  "Max Attachment Level": 5,
  "Auto Save Interval Seconds": 300.0,
  "Enable Debug Logging": false
}
```

#### Key Configuration Items

**Spawn Positions**: Set these to valid coordinates on your map
```bash
# To get your current position in-game:
# Stand where you want the spawn and type in console:
debug.log
```

**Blood Tokens**: Adjust starting tokens and per-kill rewards
- **Starting Blood Tokens**: 500 (recommended)
- **Tokens Per Kill**: 10 (adjust for your economy)

**Debug Logging**: Enable for troubleshooting
- Set to `true` to see detailed logs
- Check logs at: `oxide/logs/oxide_debug.log`

### 4. Set Permissions

Grant yourself admin permission:

```bash
# For yourself
oxide.grant user YourUsername killadome.admin

# For a group
oxide.grant group admin killadome.admin

# For VIP features
oxide.grant group vip killadome.vip
```

### 5. Test the Installation

Join your server and run:

```
/kd open
```

You should see the KillaDome lobby UI!

## First Time Setup

### Setting Up Spawn Points

1. **Find Lobby Location**
   - Choose a safe, flat area for the lobby
   - Teleport there: `/tp x y z`
   - Note the coordinates

2. **Find Arena Location**
   - Choose a separate area for matches
   - Teleport there: `/tp x y z`
   - Note the coordinates

3. **Update Config**
   - Edit `oxide/config/KillaDome.json`
   - Set both spawn positions
   - Save the file

4. **Reload Plugin**
   ```bash
   oxide.reload KillaDome
   ```

### Testing the Flow

1. **Test Lobby**
   ```bash
   /kd open
   ```
   - Should see UI with tabs
   - Try clicking different tabs

2. **Test Queue**
   - Click "PLAY" tab
   - Click "JOIN QUEUE" button
   - You should get confirmation message

3. **Test Match Start** (as admin)
   ```bash
   kd.start
   ```
   - Should teleport queued players to arena

4. **Test Stats**
   ```bash
   /kd stats
   ```
   - Should show your tokens and VIP status

## Common Commands

### Player Commands
```bash
/kd              # Show help menu
/kd open         # Open lobby UI
/kd stats        # View your stats
/kd help         # Show command list
```

### Admin Commands
```bash
kd.open          # Force open UI
kd.start         # Force start match
kd.giveskin <steamid> <skinid>    # Grant skin
kd.resetprogress <steamid>        # Reset progress
```

## Troubleshooting

### Issue: UI Doesn't Show

**Solution 1**: Check if CUI is enabled
```bash
# In server console:
cui.enabled
```

**Solution 2**: Ensure no conflicting plugins
- Disable other UI plugins temporarily
- Test if KillaDome UI shows

**Solution 3**: Check for errors
```bash
# View oxide logs:
tail -f oxide/logs/oxide_debug.log
```

### Issue: Players Can't Join Queue

**Check**:
1. Ensure plugin is loaded: `oxide.plugins`
2. Check console for errors
3. Verify spawn positions are valid
4. Enable debug logging to see what's happening

### Issue: Saves Not Persisting

**Check**:
1. Verify directory exists: `oxide/data/KillaDome/`
2. Check file permissions (write access)
3. Enable debug logging to see save attempts
4. Look for errors in oxide logs

**Fix**:
```bash
# Create directory if missing:
mkdir -p oxide/data/KillaDome
chmod 755 oxide/data/KillaDome
```

### Issue: High Memory Usage

**Solutions**:
1. Reduce auto-save interval (config)
2. Lower max players if necessary
3. Check for memory leaks in logs
4. Ensure you're using latest version

### Issue: Tebex Purchases Not Working

**Checklist**:
- ✅ `Enable Tebex Integration` is `true` in config
- ✅ `Tebex Secret Key` is set correctly
- ✅ Tebex webhook is configured
- ✅ Test purchase in Tebex dashboard
- ✅ Enable debug logging to see purchase attempts

## Performance Tuning

### For Large Servers (100+ players)

```json
{
  "UI Update Throttle MS": 200,
  "Auto Save Interval Seconds": 600.0
}
```

### For Small Servers (< 20 players)

```json
{
  "UI Update Throttle MS": 50,
  "Auto Save Interval Seconds": 120.0
}
```

## Monitoring

### Check Plugin Status
```bash
oxide.show KillaDome
```

### View Active Sessions
Enable debug logging and watch for:
```
[DEBUG] Player <name> (<steamid>) connected
[DEBUG] Auto-saved X player profiles
```

### Check Save Files
```bash
ls -lh oxide/data/KillaDome/
```

Each player should have a `<steamid>.json` file.

### Monitor Performance
```bash
# Server FPS
fps

# Memory usage
mem

# Check oxide performance
oxide.show
```

## Backup & Recovery

### Backup Player Data
```bash
# Create backup
tar -czf killadome_backup_$(date +%Y%m%d).tar.gz oxide/data/KillaDome/

# Restore from backup
tar -xzf killadome_backup_20251120.tar.gz
```

### Backup Configuration
```bash
cp oxide/config/KillaDome.json oxide/config/KillaDome.json.backup
```

## Updating the Plugin

1. **Backup Current Version**
   ```bash
   cp oxide/plugins/KillaDome.cs oxide/plugins/KillaDome.cs.backup
   ```

2. **Download New Version**
   - Replace `KillaDome.cs` with new file

3. **Reload Plugin**
   ```bash
   oxide.reload KillaDome
   ```

4. **Check Config**
   - New versions may add config options
   - Compare with example config
   - Add any missing options

5. **Test**
   - Join server
   - Test all features
   - Check for errors in logs

## Uninstalling

1. **Save All Data** (backup first!)
   ```bash
   tar -czf killadome_final_backup.tar.gz oxide/data/KillaDome/
   ```

2. **Unload Plugin**
   ```bash
   oxide.unload KillaDome
   ```

3. **Remove Files**
   ```bash
   rm oxide/plugins/KillaDome.cs
   rm oxide/config/KillaDome.json
   # Keep data if you want to reinstall later
   # rm -rf oxide/data/KillaDome/
   ```

## Getting Help

### Debug Mode

Enable detailed logging:
```json
{
  "Enable Debug Logging": true
}
```

Then reload plugin:
```bash
oxide.reload KillaDome
```

Watch logs:
```bash
tail -f oxide/logs/oxide_debug.log | grep KillaDome
```

### Log Information to Include When Reporting Issues

1. Oxide version: `oxide.version`
2. Plugin version: `oxide.show KillaDome`
3. Error messages from console
4. Relevant config settings
5. Steps to reproduce the issue

## Next Steps

After installation:

1. ✅ Configure spawn positions
2. ✅ Test lobby UI
3. ✅ Test match system
4. ✅ Set up permissions
5. ✅ Configure token economy
6. ✅ (Optional) Set up Tebex integration
7. ✅ Invite players to test
8. ✅ Monitor and tune performance

## Additional Resources

- **Full Documentation**: See `README.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Example Config**: See `KillaDome.json.example`
- **Example Profile**: See `PlayerProfile.example.json`

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│      KILLADOME QUICK REFERENCE          │
├─────────────────────────────────────────┤
│ PLAYER COMMANDS                         │
│  /kd open        Open lobby UI          │
│  /kd stats       View stats             │
│                                          │
│ ADMIN COMMANDS                          │
│  kd.start        Force match start      │
│  kd.giveskin     Grant skin to player   │
│                                          │
│ PERMISSIONS                             │
│  killadome.admin     Admin access       │
│  killadome.vip       VIP features       │
│                                          │
│ FILES                                   │
│  Plugin:   oxide/plugins/KillaDome.cs   │
│  Config:   oxide/config/KillaDome.json  │
│  Data:     oxide/data/KillaDome/        │
│  Logs:     oxide/logs/oxide_debug.log   │
└─────────────────────────────────────────┘
```

Happy fragging! 🎮
