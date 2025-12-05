---
description: "Test scanner discovery and communication"
allowed-tools: ["Bash", "Read"]
---

Test scanner connectivity:

1. **Discover scanners on network**:
   - Run scanner discovery utility
   - List all found eSCL/AirPrint scanners

2. **Test communication**:
   - Query scanner capabilities
   - Verify eSCL protocol support

3. **Optional test scan**:
   - Initiate a low-resolution test scan
   - Verify scan retrieval

Report:
- Scanners found (name, IP, model)
- Communication status
- Supported features
- Any connectivity issues
